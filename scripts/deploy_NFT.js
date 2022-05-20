// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
let { ethers, network } = require("hardhat");
let { MerkleTree } = require("merkle-tree");
let whitelist = require("./data/whitelist.json");
let whitelistLocal = require("./data/whitelist-local.json");

const NAME = "Name";
const SYMBOL = "Symbol";
const NOT_REVEALED_URI = "https://notrevealeduri.com";
const MAX_SUPPLY = 10;
const ROYALTIES_RECEIVER = ethers.constants.AddressZero;
const MAX_MINT_AMOUNT = 3;
const COST_TO_MINT = ethers.utils.parseEther("0.1");
const ROYALTIES_AMOUNT = 500; // 5%

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const whitelistRoot = getWhitelistRoot();
  console.log("Whitelist root:", whitelistRoot);

  // We get the contract to deploy
  const NFT = await ethers.getContractFactory("NFTCollection");
  const nftContract = await NFT.deploy(
    NAME,
    SYMBOL,
    NOT_REVEALED_URI,
    COST_TO_MINT,
    MAX_SUPPLY,
    MAX_MINT_AMOUNT,
    whitelistRoot,
    ROYALTIES_RECEIVER,
    ROYALTIES_AMOUNT
  );
  await nftContract.deployed();

  console.log("NFT deployed to:", nftContract.address, network.name);
}

function getWhitelistRoot() {
  const merkleTree = new MerkleTree(
    network.name === "localhost" ? whitelistLocal : whitelist,
    ["address", "uint256"]
  );
  return merkleTree.getHexRoot();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
