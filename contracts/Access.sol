// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
pragma experimental ABIEncoderV2;

contract Access {
    mapping(bytes32 => mapping(address => bool)) roleMap;

    bytes32 public constant OWNER = keccak256("OWNER");

    modifier role(bytes32 r) {
        require(roleMap[r][msg.sender] == true, "You have no permissions");
        _;
    }

    constructor() {
        _setRole(msg.sender, OWNER);
    }

    function _setRole(address usr, bytes32 r) internal {
        roleMap[r][usr] = true;
    }

    function _unsetRole(address usr, bytes32 r) internal {
        roleMap[r][usr] = false;
    }

    function hasRole(address usr, bytes32 r) public view returns (bool) {
        return roleMap[r][usr];
    }
}
