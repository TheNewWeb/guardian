// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
pragma experimental ABIEncoderV2;

interface IRetire {
    struct Pair {
        address base;
        address opposite;
        int64 baseCount;
        int64 oppositeCount;
        bool immediately;
    }

    struct Request {
        address account;
        address base;
        address opposite;
        int64 baseCount;
        int64 oppositeCount;
        int64[] baseSerials;
        int64[] oppositeSerials;
    }
}
