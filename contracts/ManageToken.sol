// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
pragma experimental ABIEncoderV2;

import "./Access.sol";
import "./hedera-smart-contracts/safe-hts-precompile/SafeHTS.sol";

contract ManageToken is SafeHTS, Access {
    event AddedWiper(address indexed wiper);
    event WiperRequest(address indexed wiper);

    bytes32 public constant WIPER = keccak256("WIPER");
    bytes32 public constant MANAGER = keccak256("MANAGER");
    bytes32 public constant ADMIN = keccak256("ADMIN");

    address[] public requests;
    mapping(address => uint256) requestPos;
    mapping(address => bool) preventRequestMap;
    bool public requestsDisabled;

    constructor(bool flag) {
        _setRole(msg.sender, WIPER);
        _setRole(msg.sender, ADMIN);
        _setRole(msg.sender, MANAGER);
        requestsDisabled = flag;
    }

    function setRequestsDisabled(bool flag) external role(ADMIN) {
        requestsDisabled = flag;
    }

    function clearWiperRequests() external role(ADMIN) {
        delete requests;
    }

    function rejectWiperRequest(address account, bool banned) public role(MANAGER) {
        address request = requests[requestPos[account] - 1];
        address last =  requests[requests.length - 1];
        requestPos[last] = requestPos[request];
        delete requestPos[request];
        requests[requestPos[account] - 1] = requests[requests.length - 1];
        requests.pop();
        if (!banned) {
            delete preventRequestMap[msg.sender];
        }
    }

    function approveWiperRequest(address account) external role(MANAGER) {
        addWiper(account);
        rejectWiperRequest(account, false);
    }

    function requestWiper() public {
        require(!preventRequestMap[msg.sender] && !hasRole(msg.sender, WIPER) && !requestsDisabled, "CAN_NOT_REQUEST");
        preventRequestMap[msg.sender] = true;
        requests.push(msg.sender);
        emit WiperRequest(msg.sender);
    }

    function addWiper(address account) public role(MANAGER) {
        _setRole(account, WIPER);
        emit AddedWiper(account);
    }

    function removeWiper(address account) public role(MANAGER) {
        _unsetRole(account, WIPER);
    }

    function addManager(address account) public role(ADMIN) {
        _setRole(account, MANAGER);
        addWiper(account);
    }

    function removeManager(address account) public role(ADMIN) {
        _unsetRole(account, MANAGER);
        removeWiper(account);
    }

    function addAdmin(address account) external role(OWNER) {
        _setRole(account, ADMIN);
        addManager(account);
    }

    function removeAdmin(address account) external role(OWNER) {
        _unsetRole(account, ADMIN);
        removeManager(account);
    }

    function isAdmin() public view returns (bool) {
        return hasRole(msg.sender, ADMIN);
    }

    function isManager() public view returns (bool) {
        return hasRole(msg.sender, MANAGER);
    }

    function isWiper() public view returns (bool) {
        return hasRole(msg.sender, WIPER);
    }

    function wipe(address token, address account, int64 amount) public role(WIPER) {
        safeWipeTokenAccount(token, account, amount);
    }

    function wipeNFT(
        address token,
        address account,
        int64[] memory serialNumbers
    ) public role(WIPER) {
        safeWipeTokenAccountNFT(token, account, serialNumbers);
    }
}
