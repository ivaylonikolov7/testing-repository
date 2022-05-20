// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const { ethers, network } = require("hardhat");

const NAME = "Name";
const SYMBOL = "Symbol";
const NOT_REVEALED_URI = "https://notrevealeduri.com";
const MAX_SUPPLY = 55;
const ROYALTIES_RECEIVER = ethers.constants.AddressZero;
const MAX_MINT_AMOUNT = 20;
const COST_TO_MINT = ethers.utils.parseEther("0.02");
const ROYALTIES_PERCENTAGE = 5;

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const NFT = await ethers.getContractFactory("SimpleNFTCollection");
  const nftContract = await NFT.deploy(
    NAME,
    SYMBOL,
    NOT_REVEALED_URI,
    COST_TO_MINT,
    MAX_SUPPLY,
    MAX_MINT_AMOUNT,
    ROYALTIES_RECEIVER,
    ROYALTIES_PERCENTAGE
  );
  await nftContract.deployed();

  console.log("NFT deployed to:", nftContract.address, network.name);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
