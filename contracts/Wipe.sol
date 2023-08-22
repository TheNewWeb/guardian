// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
pragma experimental ABIEncoderV2;

import "./Access.sol";
import "./Retire.sol";
import "./safe-hts-precompile/SafeHTS.sol";

contract Wipe is SafeHTS, Access {
    event WiperRemoved(address indexed wiper);
    event WiperAdded(address indexed wiper);
    event WiperRequested(address indexed wiper);

    bytes32 constant WIPER = keccak256("WIPER");
    bytes32 constant MANAGER = keccak256("MANAGER");
    bytes32 constant ADMIN = keccak256("ADMIN");

    address[] requestStorage;
    mapping(address => uint256) requestPos;
    mapping(address => bool) requestBan;
    bool public requestsDisabled;

    constructor() {
        _setRole(msg.sender, WIPER);
        _setRole(msg.sender, ADMIN);
        _setRole(msg.sender, MANAGER);
    }

    function requests() external view role(MANAGER) returns (address[] memory) {
        return requestStorage;
    }

    function banned() public view returns (bool) {
        return requestBan[msg.sender];
    }

    function contractType() external pure returns (string memory) {
        return "WIPE";
    }

    function setRequestsDisabled(bool flag) external role(ADMIN) {
        requestsDisabled = flag;
    }

    function clear() external role(ADMIN) {
        delete requestStorage;
    }

    function reject(address account, bool ban) public role(MANAGER) {
        require(requestPos[account] > 0, "NO_REQUEST");
        address request = requestStorage[requestPos[account] - 1];
        address last = requestStorage[requestStorage.length - 1];
        requestPos[last] = requestPos[request];
        delete requestPos[request];
        requestStorage[requestPos[account] - 1] = requestStorage[requestStorage.length - 1];
        requestStorage.pop();
        setRequestBan(msg.sender, ban);
    }

    function approve(address account) external role(MANAGER) {
        addWiper(account);
        reject(account, false);
    }

    function setRequestBan(address account, bool flag) public role(MANAGER) {
        requestBan[account] = flag;
    }

    modifier isNotBanned() {
        require(!requestBan[msg.sender], "BANNED");
        _;
    }

    modifier requestsIsNotDisabled() {
        require(!requestsDisabled, "REQUESTS_DISABLED");
        _;
    }

    function requestWiper() public isNotBanned requestsIsNotDisabled {
        if (!_hasRole(msg.sender, WIPER) && requestPos[msg.sender] == 0) {
            requestStorage.push(msg.sender);
            requestPos[msg.sender] = requestStorage.length;
            emit WiperRequested(msg.sender);
        }
    }

    function addWiper(address account) public role(MANAGER) {
        _setRole(account, WIPER);
        emit WiperAdded(account);
    }

    function removeWiper(address account) public role(MANAGER) {
        _unsetRole(account, WIPER);
        emit WiperRemoved(account);
    }

    function addManager(address account) public role(ADMIN) {
        _setRole(account, MANAGER);
    }

    function removeManager(address account) public role(ADMIN) {
        _unsetRole(account, MANAGER);
    }

    function addAdmin(address account) external role(OWNER) {
        _setRole(account, ADMIN);
    }

    function removeAdmin(address account) external role(OWNER) {
        _unsetRole(account, ADMIN);
    }

    function isAdmin() public view returns (bool) {
        return _hasRole(msg.sender, ADMIN);
    }

    function isManager() public view returns (bool) {
        return _hasRole(msg.sender, MANAGER);
    }

    function isWiper() public view returns (bool) {
        return _hasRole(msg.sender, WIPER);
    }

    function permissions() public view returns (uint8) {
        uint8 result = 0;
        if (_hasRole(msg.sender, OWNER)) {
            result += 8; // 1000
        }
        if (_hasRole(msg.sender, ADMIN)) {
            result += 4; // 0100
        }
        if (_hasRole(msg.sender, MANAGER)) {
            result += 2; // 0010
        }
        if (_hasRole(msg.sender, WIPER)) {
            result += 1; // 0001
        }
        return result;
    }

    function wipe(
        address token,
        address account,
        int64 amount
    ) public role(WIPER) {
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
