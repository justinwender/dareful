// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { DarefulLedger } from "../src/DarefulLedger.sol";
import { DarefulDares } from "../src/DarefulDares.sol";

/// @dev Shared fixture: one relayer, five users with a ledger and a governance wallet each, one group with all
///      five as members, and three denominations (USD and beer quantifiable, "next time" unquantifiable).
abstract contract DarefulTestBase is Test {
    struct User {
        uint256 ledgerPk;
        address ledger;
        uint256 governancePk;
        address governance;
    }

    address internal constant RELAYER = address(0xBEEF);
    DarefulLedger internal ledger;
    DarefulDares internal dares;

    bytes32 internal constant GROUP = keccak256("group:friday");
    bytes32 internal constant USD = keccak256("denom:usd");
    bytes32 internal constant BEER = keccak256("denom:beer");
    bytes32 internal constant NEXT = keccak256("denom:next_time");

    User[] internal users;

    function setUp() public virtual {
        ledger = new DarefulLedger(RELAYER);
        dares = new DarefulDares(ledger, RELAYER);
        vm.prank(RELAYER);
        ledger.setDares(address(dares));

        for (uint256 i = 0; i < 5; i++) {
            uint256 lpk = uint256(keccak256(abi.encode("ledger", i)));
            uint256 gpk = uint256(keccak256(abi.encode("governance", i)));
            users.push(User({ ledgerPk: lpk, ledger: vm.addr(lpk), governancePk: gpk, governance: vm.addr(gpk) }));
        }
        DarefulLedger.Member[] memory ms = new DarefulLedger.Member[](5);
        for (uint256 i = 0; i < 5; i++) {
            ms[i] = DarefulLedger.Member({ ledger: users[i].ledger, governance: users[i].governance });
        }
        vm.startPrank(RELAYER);
        ledger.createGroup(GROUP, ms);
        ledger.createDenom(GROUP, USD, true);
        ledger.createDenom(GROUP, BEER, true);
        ledger.createDenom(GROUP, NEXT, false);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ signing helpers

    function _typed(bytes32 domain, bytes32 structHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function signConfirm(
        uint256 pk,
        bytes32 groupId,
        bytes32 denomId,
        address creditor,
        uint256 qty,
        bytes16 obligationId,
        bool unique
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(ledger.CONFIRM_TYPEHASH(), groupId, denomId, creditor, qty, obligationId, unique)
        );
        return _sign(pk, _typed(ledger.domainSeparator(), structHash));
    }

    function signConfirmMany(
        uint256 pk,
        bytes32[] memory groupIds,
        bytes32[] memory denomIds,
        address[] memory creditors,
        uint256[] memory qtys,
        bytes16[] memory obligationIds,
        bool[] memory uniques
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                ledger.CONFIRM_MANY_TYPEHASH(),
                keccak256(abi.encodePacked(groupIds)),
                keccak256(abi.encodePacked(denomIds)),
                keccak256(abi.encodePacked(creditors)),
                keccak256(abi.encodePacked(qtys)),
                keccak256(abi.encodePacked(obligationIds)),
                keccak256(abi.encodePacked(uniques))
            )
        );
        return _sign(pk, _typed(ledger.domainSeparator(), structHash));
    }

    function signClose(
        uint256 pk,
        uint256 id,
        uint256 qty,
        DarefulLedger.CloseReason reason,
        bytes16 obligationId,
        uint256 nonce
    ) internal view returns (bytes memory) {
        bytes32 structHash =
            keccak256(abi.encode(ledger.CLOSE_TYPEHASH(), id, qty, uint8(reason), obligationId, nonce));
        return _sign(pk, _typed(ledger.domainSeparator(), structHash));
    }

    function signNet(uint256 pk, bytes32 groupId, bytes32 denomId, address a, address b, uint256 nonce)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(abi.encode(ledger.NET_TYPEHASH(), groupId, denomId, a, b, nonce));
        return _sign(pk, _typed(ledger.domainSeparator(), structHash));
    }

    function signCreate(uint256 pk, DarefulDares.Dare memory d) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                dares.CREATE_TYPEHASH(),
                d.id,
                d.groupId,
                uint8(d.kind),
                uint8(d.pace),
                d.termsHash,
                d.denomId,
                d.range,
                d.options,
                uint8(d.stalemate),
                d.resolvesBy
            )
        );
        return _sign(pk, _typed(dares.domainSeparator(), structHash));
    }

    function signEnter(
        uint256 pk,
        bytes32 dareId,
        uint256 stake,
        uint256 value,
        uint16 confidenceBps,
        DarefulDares.Stalemate stalemate
    ) internal view returns (bytes memory) {
        bytes32 structHash =
            keccak256(abi.encode(dares.ENTER_TYPEHASH(), dareId, stake, value, confidenceBps, uint8(stalemate)));
        return _sign(pk, _typed(dares.domainSeparator(), structHash));
    }

    function signVote(uint256 pk, bytes32 dareId, uint256 outcome) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(dares.VOTE_TYPEHASH(), dareId, outcome));
        return _sign(pk, _typed(dares.domainSeparator(), structHash));
    }

    // ------------------------------------------------------------------ ledger helpers

    function ob(uint256 n) internal pure returns (bytes16) {
        return bytes16(keccak256(abi.encode("obligation", n)));
    }

    /// @dev users[debtor] confirms owing users[creditor] `qty` of `denom` under obligation `obId`.
    function confirmBetween(uint256 debtor, uint256 creditor, bytes32 denom, uint256 qty, bytes16 obId)
        internal
        returns (uint256 id)
    {
        bytes memory sig = signConfirm(users[debtor].ledgerPk, GROUP, denom, users[creditor].ledger, qty, obId, false);
        ledger.confirm(GROUP, denom, users[creditor].ledger, qty, obId, false, sig);
        id = ledger.fungibleId(GROUP, denom, users[debtor].ledger);
    }

    /// @dev What users[debtor] owes users[creditor] in `denom` (fungible edge).
    function owed(uint256 debtor, uint256 creditor, bytes32 denom) internal view returns (uint256) {
        return ledger.balanceOf(users[creditor].ledger, ledger.fungibleId(GROUP, denom, users[debtor].ledger));
    }

    /// @dev Net position of users[i] against everyone in `idx`: what they are owed minus what they owe.
    function netOf(uint256 i, bytes32 denom, uint256[] memory idx) internal view returns (int256 n) {
        for (uint256 k = 0; k < idx.length; k++) {
            if (idx[k] == i) continue;
            n += int256(owed(idx[k], i, denom));
            n -= int256(owed(i, idx[k], denom));
        }
    }

    // ------------------------------------------------------------------ dares helpers

    function baseDare(
        bytes32 id,
        DarefulDares.Kind kind,
        bytes32 denom,
        DarefulDares.Stalemate stalemate,
        uint64 resolvesBy,
        uint256 range,
        uint8 options,
        uint256 creatorIdx
    ) internal view returns (DarefulDares.Dare memory d) {
        d.id = id;
        d.groupId = GROUP;
        d.kind = kind;
        d.pace = DarefulDares.Pace.Dare;
        d.creator = users[creatorIdx].ledger;
        d.termsHash = keccak256("terms");
        d.denomId = denom;
        d.range = range;
        d.options = options;
        d.stalemate = stalemate;
        d.quorum = new address[](0);
        d.threshold = 0;
        d.resolvesBy = resolvesBy;
        d.status = DarefulDares.Status.Locked;
        d.outcome = 0;
    }

    function positionsFor(
        bytes32 dareId,
        DarefulDares.Stalemate stalemate,
        uint256[] memory idx,
        uint256[] memory stakes,
        uint256[] memory values,
        uint16[] memory confidences
    ) internal view returns (DarefulDares.Position[] memory ps, bytes[] memory sigs) {
        ps = new DarefulDares.Position[](idx.length);
        sigs = new bytes[](idx.length);
        for (uint256 k = 0; k < idx.length; k++) {
            uint16 c = confidences.length == 0 ? 0 : confidences[k];
            ps[k] = DarefulDares.Position({
                ledger: users[idx[k]].ledger, stake: stakes[k], value: values[k], confidenceBps: c
            });
            sigs[k] = signEnter(users[idx[k]].ledgerPk, dareId, stakes[k], values[k], c, stalemate);
        }
    }

    function votesFrom(uint256[] memory idx, bytes32 dareId, uint256 outcome)
        internal
        view
        returns (bytes[] memory vs)
    {
        vs = new bytes[](idx.length);
        for (uint256 k = 0; k < idx.length; k++) {
            vs[k] = signVote(users[idx[k]].governancePk, dareId, outcome);
        }
    }

    function arr(uint256 a, uint256 b) internal pure returns (uint256[] memory r) {
        r = new uint256[](2);
        r[0] = a;
        r[1] = b;
    }

    function arr(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory r) {
        r = new uint256[](3);
        r[0] = a;
        r[1] = b;
        r[2] = c;
    }

    function arr(uint256 a, uint256 b, uint256 c, uint256 d) internal pure returns (uint256[] memory r) {
        r = new uint256[](4);
        r[0] = a;
        r[1] = b;
        r[2] = c;
        r[3] = d;
    }

    function noConf() internal pure returns (uint16[] memory r) {
        r = new uint16[](0);
    }
}
