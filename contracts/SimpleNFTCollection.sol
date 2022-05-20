// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./ERC2981/ERC2981Base.sol";

contract SimpleNFTCollection is ERC721Enumerable, ERC2981Base, Ownable {
    using Strings for uint256;

    string public constant BASE_EXTENSION = ".json";

    uint256 public immutable cost;
    uint256 public immutable maxSupply;
    uint256 public immutable saleMaxMintAmount;
    uint256 public immutable royaltiesPercentage;

    string public baseURI;
    bool public mintActive = true;
    bool public revealed = false;

    address private royaltiesReceiver;

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _notRevealedUri,
        uint256 _cost,
        uint256 _maxSupply,
        uint256 _saleMaxMintAmount,
        address _royaltiesReceiver,
        uint256 _royaltiesPercentage
    ) ERC721(_name, _symbol) {
        baseURI = _notRevealedUri;
        cost = _cost;
        maxSupply = _maxSupply;
        saleMaxMintAmount = _saleMaxMintAmount;
        royaltiesReceiver = _royaltiesReceiver;
        royaltiesPercentage = _royaltiesPercentage;
    }

    // internal
    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI;
    }

    function _mintAmount(uint256 _amount) internal {
        require(mintActive, "minting not active");
        require(_amount > 0, "need to mint at least 1 NFT");
        require(
            _amount <= saleMaxMintAmount,
            "max mint amount per tx exceeded"
        );
        uint256 supply = totalSupply();
        require(supply + _amount <= maxSupply, "max supply exceeded");

        for (uint256 i = 1; i <= _amount; i++) {
            _safeMint(msg.sender, supply + i);
        }
    }

    // public
    function mint(uint256 _amount) external payable {
        require(msg.value >= _amount * cost, "insufficient value sent");
        _mintAmount(_amount);
    }

    function walletOfOwner(address _owner)
        public
        view
        returns (uint256[] memory)
    {
        uint256 ownerTokenCount = balanceOf(_owner);
        uint256[] memory tokenIds = new uint256[](ownerTokenCount);
        for (uint256 i; i < ownerTokenCount; i++) {
            tokenIds[i] = tokenOfOwnerByIndex(_owner, i);
        }
        return tokenIds;
    }

    function tokenURI(uint256 _tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        require(
            _exists(_tokenId),
            "ERC721Metadata: URI query for nonexistent token"
        );
        string memory uri = _baseURI();
        if (revealed) {
            return
                bytes(uri).length > 0
                    ? string(
                        abi.encodePacked(
                            uri,
                            _tokenId.toString(),
                            BASE_EXTENSION
                        )
                    )
                    : "";
        }
        return uri;
    }

    function royaltyInfo(uint256, uint256 _value)
        external
        view
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        receiver = royaltiesReceiver;
        royaltyAmount = (_value * royaltiesPercentage) / 100;
    }

    function supportsInterface(bytes4 _interfaceId)
        public
        view
        virtual
        override(ERC721Enumerable, ERC2981Base)
        returns (bool)
    {
        return super.supportsInterface(_interfaceId);
    }

    function reveal() external onlyOwner {
        revealed = true;
    }

    function setBaseURI(string memory _newBaseURI) external onlyOwner {
        baseURI = _newBaseURI;
    }

    function setMintActive(bool _state) external onlyOwner {
        mintActive = _state;
    }

    function setRoyaltiesReceiver(address _receiver) external onlyOwner {
        royaltiesReceiver = _receiver;
    }

    function withdraw() external onlyOwner {
        (bool sent, ) = payable(owner()).call{value: address(this).balance}("");
        require(sent, "failed to send funds to owner");
    }
}
