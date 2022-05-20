const { ethers } = require("hardhat");
const { MerkleTree, hashIt } = require("merkle-tree");
const { expect } = require("chai");
const whitelist = require("./whitelist-limits.json");

const { AddressZero } = ethers.constants;

const Interfaces = {
  ERC165: "0x01ffc9a7",
  ERC721: "0x80ac58cd",
  ERC2981: "0x2a55205a",
};

const whitelistFormat = ["address", "uint256"];

function hashWhitelistEntry(account, allowance) {
  return hashIt([account, allowance], whitelistFormat);
}

async function deploy(name, ...params) {
  const Contract = await ethers.getContractFactory(name);
  return await Contract.deploy(...params).then((f) => f.deployed());
}

describe("NFT", function () {
  let nft;
  let admin;
  let user;
  let whitelistedUser;
  let royaltiesReceiver;
  let accounts;
  let maxMintAmount;
  let costToMint;
  let merkleTree;

  const fakeNft = {
    name: "Name",
    symbol: "SYMBOL",
    notRevealedUri: "https://notrevealeduri.com",
    maxSupply: 5,
    maxMintAmount: 3,
    costToMint: ethers.utils.parseEther("0.1"),
    royaltiesAmount: 500,
  };

  const whitelistedUserAllowance = 2;

  before(async function () {
    [admin, user, whitelistedUser, royaltiesReceiver, ...accounts] =
      await ethers.getSigners();

    merkleTree = new MerkleTree(
      [[whitelistedUser.address, whitelistedUserAllowance], ...whitelist],
      whitelistFormat
    );
  });

  beforeEach(async function () {
    nft = await deploy(
      "NFTCollection",
      fakeNft.name,
      fakeNft.symbol,
      fakeNft.notRevealedUri,
      fakeNft.costToMint,
      fakeNft.maxSupply,
      fakeNft.maxMintAmount,
      merkleTree.getHexRoot(),
      royaltiesReceiver.address,
      fakeNft.royaltiesAmount
    );
    maxMintAmount = await nft.saleMaxMintAmount();
    costToMint = await nft.cost();
  });

  describe("Pre-sale", function () {
    it("should allow whitelisted users to mint", async function () {
      const proof = merkleTree.getHexProof(
        hashWhitelistEntry(whitelistedUser.address, whitelistedUserAllowance)
      );
      await expect(
        nft
          .connect(whitelistedUser)
          .mintPresale(1, whitelistedUserAllowance, proof, {
            value: costToMint,
          })
      )
        .to.emit(nft, "Transfer")
        .withArgs(AddressZero, whitelistedUser.address, 1);
    });

    it("should allow using allowance in separate txs", async function () {
      const proof = merkleTree.getHexProof(
        hashWhitelistEntry(whitelistedUser.address, whitelistedUserAllowance)
      );
      await expect(
        nft
          .connect(whitelistedUser)
          .mintPresale(1, whitelistedUserAllowance, proof, {
            value: costToMint,
          })
      )
        .to.emit(nft, "Transfer")
        .withArgs(AddressZero, whitelistedUser.address, 1);
      await expect(
        nft
          .connect(whitelistedUser)
          .mintPresale(1, whitelistedUserAllowance, proof, {
            value: costToMint,
          })
      )
        .to.emit(nft, "Transfer")
        .withArgs(AddressZero, whitelistedUser.address, 2);
    });

    it("should not allow non-whitelisted users to mint", async function () {
      const proof = merkleTree.getHexProof(
        hashWhitelistEntry(user.address, whitelistedUserAllowance)
      );
      await expect(
        nft.connect(user).mintPresale(1, whitelistedUserAllowance, proof, {
          value: costToMint,
        })
      ).to.be.revertedWith("user is not whitelisted or allowance is incorrect");
    });

    it("should not allow minting when not active", async function () {
      await nft.setMintActive(false);
      const proof = merkleTree.getHexProof(
        hashWhitelistEntry(whitelistedUser.address, whitelistedUserAllowance)
      );
      await expect(
        nft
          .connect(whitelistedUser)
          .mintPresale(1, whitelistedUserAllowance, proof, {
            value: costToMint,
          })
      ).to.be.revertedWith("minting not active");
    });

    it("should fail if allowance is incorrect", async function () {
      const wrongAllowance = 1;
      const proof = merkleTree.getHexProof(
        hashWhitelistEntry(whitelistedUser.address, whitelistedUserAllowance)
      );
      await expect(
        nft.connect(whitelistedUser).mintPresale(1, wrongAllowance, proof, {
          value: costToMint,
        })
      ).to.be.revertedWith("user is not whitelisted or allowance is incorrect");
    });

    it("should fail if proof is incorrect", async function () {
      const proof = merkleTree.getHexProof(
        hashWhitelistEntry(user.address, whitelistedUserAllowance)
      );
      await expect(
        nft
          .connect(whitelistedUser)
          .mintPresale(1, whitelistedUserAllowance, proof, {
            value: costToMint,
          })
      ).to.be.revertedWith("user is not whitelisted or allowance is incorrect");
    });

    it("should fail if whitelisted user tries minting more than allowed", async function () {
      const proof = merkleTree.getHexProof(
        hashWhitelistEntry(whitelistedUser.address, whitelistedUserAllowance)
      );
      await expect(
        nft
          .connect(whitelistedUser)
          .mintPresale(
            whitelistedUserAllowance + 1,
            whitelistedUserAllowance,
            proof,
            {
              value: costToMint.mul(whitelistedUserAllowance + 1),
            }
          )
      ).to.be.revertedWith("allowance exceeded");
    });
  });

  describe("Sale", function () {
    beforeEach(async function () {
      await nft.setPublicSale(true);
    });

    it("should allow anyone to mint", async function () {
      await expect(
        nft.connect(user).mint(1, {
          value: costToMint,
        })
      )
        .to.emit(nft, "Transfer")
        .withArgs(AddressZero, user.address, 1);
    });

    it("should mint all requested nfts", async function () {
      const mintTx = await nft.connect(user).mint(2, {
        value: costToMint.mul(2),
      });
      const { events } = await mintTx.wait();
      expect(
        events.filter(
          (e) =>
            e.event === "Transfer" &&
            e.args.from === AddressZero &&
            e.args.to === user.address
        ).length
      ).to.equal(2);
    });

    it("should not allow minting if public sale not active", async function () {
      await nft.setPublicSale(false);
      await expect(
        nft.connect(user).mint(1, {
          value: costToMint,
        })
      ).to.be.revertedWith("not in public sale");
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
      await nft.setPublicSale(true);
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
      await nft.setPublicSale(true);
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
      const royaltyInfo = await nft.royaltyInfo(0, 1000);
      expect(royaltyInfo.receiver).to.equal(royaltiesReceiver.address);
      expect(royaltyInfo.royaltyAmount).to.equal(50);
    });
  });

  describe("Admin", function () {
    it("should allow admin to withdraw funds", async function () {
      await nft.setPublicSale(true);
      await nft.connect(user).mint(1, {
        value: costToMint,
      });
      await expect(() => nft.withdraw()).to.changeEtherBalance(
        admin,
        costToMint
      );
    });

    it("should fail if regular user tries to withdraw funds", async function () {
      await expect(nft.connect(user).withdraw()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should allow admin to mint tokens to multiple addresses", async function () {
      const mintToAddresses = [
        accounts[0].address,
        accounts[1].address,
        accounts[2].address,
      ];
      await nft.connect(admin).mintTo(mintToAddresses);

      expect(await nft.ownerOf(1)).to.equal(mintToAddresses[0]);
      expect(await nft.ownerOf(2)).to.equal(mintToAddresses[1]);
      expect(await nft.ownerOf(3)).to.equal(mintToAddresses[2]);
    });

    it("should not allow regular users to mint tokens to multiple addresses", async function () {
      await expect(nft.connect(user).mintTo([])).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should not allow admin to mint to multiple addresses if cap reached", async function () {
      const mintToAddresses = accounts
        .slice(0, fakeNft.maxSupply + 1)
        .map((i) => i.address);
      await expect(
        nft.connect(admin).mintTo(mintToAddresses)
      ).to.be.revertedWith("max supply exceeded");
    });

    it("should allow admin to change royalty receiver", async function () {
      const newReceiver = accounts[0];
      await nft.connect(admin).setRoyaltiesReceiver(newReceiver.address);

      const newRoyaltyInfo = await nft.royaltyInfo(0, 1000);
      expect(newRoyaltyInfo.receiver).to.equal(newReceiver.address);
    });

    it("should allow admin to update whitelist", async function () {
      const allowance = 1;
      const newWhitelist = [[user.address, allowance]];
      const newMerkleTree = new MerkleTree(newWhitelist, whitelistFormat);
      await nft.setWhitelistRoot(newMerkleTree.getHexRoot());

      const proof = newMerkleTree.getHexProof(
        hashWhitelistEntry(user.address, allowance)
      );
      await expect(
        nft.connect(user).mintPresale(1, allowance, proof, {
          value: costToMint,
        })
      )
        .to.emit(nft, "Transfer")
        .withArgs(AddressZero, user.address, 1);
    });
  });

  describe("Misc", function () {
    it("should return owner token ids", async function () {
      nft.setPublicSale(true);
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
