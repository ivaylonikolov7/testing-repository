const { ethers } = require("hardhat");
const { expect } = require("chai");

const { AddressZero } = ethers.constants;

const Interfaces = {
  ERC165: "0x01ffc9a7",
  ERC721: "0x80ac58cd",
  ERC2981: "0x2a55205a",
};

async function deploy(name, ...params) {
  const Contract = await ethers.getContractFactory(name);
  return await Contract.deploy(...params).then((f) => f.deployed());
}

describe("SimpleNFT", function () {
  let nft;
  let admin;
  let user;
  let royaltiesReceiver;
  let accounts;
  let maxMintAmount;
  let costToMint;

  const fakeNft = {
    name: "Name",
    symbol: "SYMBOL",
    notRevealedUri: "https://notrevealeduri.com",
    maxSupply: 55,
    maxMintAmount: 20,
    costToMint: ethers.utils.parseEther("0.02"),
    royaltiesPercentage: 5,
  };

  before(async function () {
    [admin, user, royaltiesReceiver, ...accounts] = await ethers.getSigners();
  });

  beforeEach(async function () {
    nft = await deploy(
      "SimpleNFTCollection",
      fakeNft.name,
      fakeNft.symbol,
      fakeNft.notRevealedUri,
      fakeNft.costToMint,
      fakeNft.maxSupply,
      fakeNft.maxMintAmount,
      royaltiesReceiver.address,
      fakeNft.royaltiesPercentage
    );
    maxMintAmount = await nft.saleMaxMintAmount();
    costToMint = await nft.cost();
  });

  describe("Sale", function () {
    beforeEach(async function () {
      await nft.setMintActive(true);
    });

    it("should allow anyone to mint", async function () {
      await expect(
        nft.connect(user).mint(5, {
          value: costToMint.mul(5),
        })
      )
        .to.emit(nft, "Transfer")
        .withArgs(AddressZero, user.address, 5);
    });

    it("should mint all requested paid nfts", async function () {
      const mintTx = await nft.connect(user).mint(5, {
        value: costToMint.mul(5),
      });
      const { events } = await mintTx.wait();
      expect(
        events.filter(
          (e) =>
            e.event === "Transfer" &&
            e.args.from === AddressZero &&
            e.args.to === user.address
        ).length
      ).to.equal(5);
    });

    it("should not allow minting if cap reached", async function () {
      for (let i = 0; i < fakeNft.maxSupply; i++) {
        await nft.connect(user).mint(1, {
          value: costToMint,
        });
      }
      await expect(
        nft.connect(user).mint(1, {
          value: costToMint,
        })
      ).to.be.revertedWith("max supply exceeded");
    });

    it("should not allow minting when not active", async function () {
      await nft.setMintActive(false);
      await expect(
        nft.connect(user).mint(1, {
          value: costToMint,
        })
      ).to.be.revertedWith("minting not active");
    });

    it("should not allow minting more than the max limit per tx", async function () {
      await expect(
        nft.connect(user).mint(maxMintAmount + 1, {
          value: costToMint.mul(maxMintAmount + 1),
        })
      ).to.be.revertedWith("max mint amount per tx exceeded");
    });

    it("should require minting at least 1 NFT", async function () {
      await expect(nft.connect(user).mint(0)).to.be.revertedWith(
        "need to mint at least 1 NFT"
      );
    });

    it("should fail if funds are insufficient", async function () {
      await expect(
        nft.connect(user).mint(2, {
          value: costToMint,
        })
      ).to.be.revertedWith("insufficient value sent");
    });
  });

  describe("Pre-reveal", function () {
    beforeEach(async function () {
      await nft.setMintActive(true);
      await nft.connect(user).mint(1, {
        value: costToMint,
      });
    });

    it("should return not-revealed URI", async function () {
      expect(await nft.tokenURI(1)).to.equal(fakeNft.notRevealedUri);
    });
  });

  describe("Reveal", function () {
    const baseURI = "ipfs://QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF/";
    const baseExtension = ".json";

    beforeEach(async function () {
      await nft.setMintActive(true);
      await nft.connect(user).mint(1, {
        value: costToMint,
      });
      await nft.setBaseURI(baseURI);
      await nft.reveal();
    });

    it("should return correct tokenURI", async function () {
      expect(await nft.tokenURI(1)).to.equal(baseURI + 1 + baseExtension);
    });

    it("should return empty string if baseURI is not set", async function () {
      await nft.setBaseURI("");

      expect(await nft.tokenURI(1)).to.equal("");
    });

    it("should revert if requested token does not exist", async function () {
      await expect(nft.tokenURI(2)).to.be.revertedWith(
        "ERC721Metadata: URI query for nonexistent token"
      );
    });
  });

  describe("Royalties", function () {
    it("should have the right interfaces", async function () {
      expect(await nft.supportsInterface(Interfaces.ERC165)).equals(true);
      expect(await nft.supportsInterface(Interfaces.ERC721)).equals(true);
      expect(await nft.supportsInterface(Interfaces.ERC2981)).equals(true);
    });

    it("should return correct royalty info", async function () {
      const value = 1000;
      const royaltyInfo = await nft.royaltyInfo(0, value);
      expect(royaltyInfo.receiver).to.equal(royaltiesReceiver.address);
      expect(royaltyInfo.royaltyAmount).to.equal(
        (value * fakeNft.royaltiesPercentage) / 100
      );
    });
  });

  describe("Admin", function () {
    it("should allow admin to withdraw funds", async function () {
      await nft.setMintActive(true);
      await nft.connect(user).mint(5, {
        value: costToMint.mul(5),
      });
      await expect(() => nft.withdraw()).to.changeEtherBalance(
        admin,
        costToMint.mul(5)
      );
    });

    it("should fail if regular user tries to withdraw funds", async function () {
      await expect(nft.connect(user).withdraw()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should allow admin to change royalty receiver", async function () {
      const newReceiver = accounts[0];
      await nft.connect(admin).setRoyaltiesReceiver(newReceiver.address);

      const newRoyaltyInfo = await nft.royaltyInfo(0, 1000);
      expect(newRoyaltyInfo.receiver).to.equal(newReceiver.address);
    });
  });

  describe("Misc", function () {
    it("should return owner token ids", async function () {
      nft.setMintActive(true);
      await nft.connect(user).mint(2, {
        value: costToMint.mul(2),
      });
      expect(await nft.walletOfOwner(user.address)).to.deep.equal([
        ethers.BigNumber.from(1),
        ethers.BigNumber.from(2),
      ]);
    });
  });
});
