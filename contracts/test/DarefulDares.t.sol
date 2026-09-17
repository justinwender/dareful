// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { DarefulTestBase } from "./Base.t.sol";
import { DarefulLedger } from "../src/DarefulLedger.sol";
import { DarefulDares } from "../src/DarefulDares.sol";

contract DarefulDaresTest is DarefulTestBase {
    bytes32 internal constant DARE = keccak256("dare:movie");
    uint64 internal constant DEADLINE = 1_800_000_000;
    uint256 internal constant VOID_ = type(uint256).max;

    function _binary(bytes32 id, DarefulDares.Stalemate st) internal view returns (DarefulDares.Dare memory) {
        return baseDare(id, DarefulDares.Kind.Binary, USD, st, DEADLINE, 0, 0, 0);
    }

    /// @dev The worked example from PLANNING.md 8c: does John fall asleep during the movie?
    ///      Justin $15 at 20%, Gabe $20 at 70%, Alex $5 at 50%, John $50 at 0%. Users 0..3 in that order.
    function _workedExample(DarefulDares.Stalemate st)
        internal
        view
        returns (DarefulDares.Dare memory d, DarefulDares.Position[] memory ps, bytes[] memory sigs)
    {
        d = _binary(DARE, st);
        uint256[] memory stakes = arr(1500, 2000, 500, 5000);
        uint256[] memory values = arr(2000, 7000, 5000, 0);
        (ps, sigs) = positionsFor(DARE, st, arr(0, 1, 2, 3), stakes, values, noConf());
    }

    function _createWorked(DarefulDares.Stalemate st) internal {
        (DarefulDares.Dare memory d, DarefulDares.Position[] memory ps, bytes[] memory sigs) = _workedExample(st);
        dares.create(d, ps, sigs, signCreate(users[0].ledgerPk, d));
    }

    // ------------------------------------------------------------------ create

    function test_CreateReadsQuorumFromLedgerAndIgnoresCalldata() public {
        (DarefulDares.Dare memory d, DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            _workedExample(DarefulDares.Stalemate.Arbitrate);
        // An attacker-controlled quorum and a threshold of one in calldata.
        uint256 attackerPk = 0xA77AC;
        d.quorum = new address[](1);
        d.quorum[0] = vm.addr(attackerPk);
        d.threshold = 1;
        d.status = DarefulDares.Status.Resolved;
        d.outcome = 1;
        dares.create(d, ps, sigs, signCreate(users[0].ledgerPk, d));

        DarefulDares.Dare memory stored = dares.dareOf(DARE);
        assertEq(stored.quorum.length, 5, "quorum is the whole group from the ledger");
        for (uint256 i = 0; i < 5; i++) {
            assertEq(stored.quorum[i], users[i].governance);
        }
        assertEq(stored.threshold, 3, "floor(5 / 2) + 1");
        assertEq(uint8(stored.status), uint8(DarefulDares.Status.Locked));
        assertEq(stored.outcome, 0);

        // The attacker's vote is not in the quorum, and one real vote is below threshold.
        bytes[] memory v = new bytes[](1);
        v[0] = signVote(attackerPk, DARE, 1);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.NotInQuorum.selector, vm.addr(attackerPk)));
        dares.resolve(DARE, 1, v);

        v[0] = signVote(users[0].governancePk, DARE, 1);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.BelowThreshold.selector, 1, 3));
        dares.resolve(DARE, 1, v);
    }

    function test_CreateStoresEveryPositionAndEmits() public {
        (DarefulDares.Dare memory d, DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            _workedExample(DarefulDares.Stalemate.Arbitrate);
        bytes memory csEmit = signCreate(users[0].ledgerPk, d);
        vm.expectEmit(true, true, true, true);
        emit DarefulDares.DareCreated(
            DARE, GROUP, d.kind, d.pace, d.creator, d.termsHash, USD, 0, 0, d.stalemate, DEADLINE
        );
        for (uint256 i = 0; i < 4; i++) {
            vm.expectEmit(true, true, true, true);
            emit DarefulDares.Entered(DARE, ps[i].ledger, ps[i].stake, ps[i].value, 0);
        }
        dares.create(d, ps, sigs, csEmit);
        DarefulDares.Position[] memory stored = dares.positionsOf(DARE);
        assertEq(stored.length, 4);
        assertEq(stored[3].stake, 5000);
        assertEq(stored[3].value, 0);
    }

    function test_CreateIsAtomicWhenOneEntrySignatureIsBad() public {
        (DarefulDares.Dare memory d, DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            _workedExample(DarefulDares.Stalemate.Arbitrate);
        sigs[2] = signEnter(users[2].ledgerPk, DARE, 500, 5001, 0, d.stalemate); // signed a different value
        bytes memory cs1 = signCreate(users[0].ledgerPk, d);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.BadEnterSignature.selector, 2));
        dares.create(d, ps, sigs, cs1);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.UnknownDare.selector, DARE));
        dares.dareOf(DARE);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.UnknownDare.selector, DARE));
        dares.positionsOf(DARE);
    }

    function test_CreateIsAtomicWhenOnePositionIsANonMember() public {
        (DarefulDares.Dare memory d, DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            _workedExample(DarefulDares.Stalemate.Arbitrate);
        uint256 strangerPk = 0x57;
        ps[3].ledger = vm.addr(strangerPk);
        sigs[3] = signEnter(strangerPk, DARE, ps[3].stake, ps[3].value, 0, d.stalemate);
        bytes memory cs2 = signCreate(users[0].ledgerPk, d);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.NotMember.selector, vm.addr(strangerPk)));
        dares.create(d, ps, sigs, cs2);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.UnknownDare.selector, DARE));
        dares.dareOf(DARE);
    }

    function test_OnePositionPerWallet() public {
        DarefulDares.Dare memory d = _binary(DARE, DarefulDares.Stalemate.Arbitrate);
        (DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            positionsFor(DARE, d.stalemate, arr(0, 1, 1), arr(100, 100, 100), arr(5000, 6000, 7000), noConf());
        bytes memory cs3 = signCreate(users[0].ledgerPk, d);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.DuplicatePosition.selector, users[1].ledger));
        dares.create(d, ps, sigs, cs3);
    }

    function test_CreateRequiresAtLeastTwoPositions() public {
        DarefulDares.Dare memory d = _binary(DARE, DarefulDares.Stalemate.Arbitrate);
        uint256[] memory one = new uint256[](1);
        one[0] = 0;
        uint256[] memory s = new uint256[](1);
        s[0] = 100;
        uint256[] memory v = new uint256[](1);
        v[0] = 5000;
        (DarefulDares.Position[] memory ps, bytes[] memory sigs) = positionsFor(DARE, d.stalemate, one, s, v, noConf());
        bytes memory cs4 = signCreate(users[0].ledgerPk, d);
        vm.expectRevert(DarefulDares.TooFewPositions.selector);
        dares.create(d, ps, sigs, cs4);
    }

    function test_CreateRequiresCreatorSignatureAndMembership() public {
        (DarefulDares.Dare memory d, DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            _workedExample(DarefulDares.Stalemate.Arbitrate);
        bytes memory cs5 = signCreate(users[1].ledgerPk, d);
        vm.expectRevert(DarefulDares.BadCreatorSignature.selector);
        dares.create(d, ps, sigs, cs5);

        uint256 strangerPk = 0x57;
        d.creator = vm.addr(strangerPk);
        bytes memory cs6 = signCreate(strangerPk, d);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.NotMember.selector, d.creator));
        dares.create(d, ps, sigs, cs6);
    }

    function test_CreateRejectsSecondMarketWithSameId() public {
        _createWorked(DarefulDares.Stalemate.Arbitrate);
        (DarefulDares.Dare memory d, DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            _workedExample(DarefulDares.Stalemate.Arbitrate);
        bytes memory cs7 = signCreate(users[0].ledgerPk, d);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.DareExists.selector, DARE));
        dares.create(d, ps, sigs, cs7);
    }

    function test_EntrySignatureBindsTheStalemateRule() public {
        // Positions signed under Void, submitted under Arbitrate: consent to the rule is in the signature.
        (DarefulDares.Dare memory d, DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            _workedExample(DarefulDares.Stalemate.Void);
        d.stalemate = DarefulDares.Stalemate.Arbitrate;
        bytes memory cs8 = signCreate(users[0].ledgerPk, d);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.BadEnterSignature.selector, 0));
        dares.create(d, ps, sigs, cs8);
    }

    // ------------------------------------------------------------------ resolve

    function test_ThresholdIsMajorityOfTheWholeGroup() public {
        _createWorked(DarefulDares.Stalemate.Arbitrate);
        bytes[] memory v12 = votesFrom(arr(0, 1), DARE, 1);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.BelowThreshold.selector, 2, 3));
        dares.resolve(DARE, 1, v12);

        // Two participants plus one witness (user 4 is in the group, not the market).
        bytes[] memory v19 = votesFrom(arr(0, 1, 4), DARE, 1);
        vm.expectEmit(true, true, true, true);
        emit DarefulDares.DareResolved(DARE, 1, 3);
        dares.resolve(DARE, 1, v19);
        assertEq(uint8(dares.dareOf(DARE).status), uint8(DarefulDares.Status.Resolved));
        assertEq(dares.dareOf(DARE).outcome, 1);
    }

    function test_DuplicateSignerCountsOnce() public {
        _createWorked(DarefulDares.Stalemate.Arbitrate);
        bytes[] memory v13 = votesFrom(arr(0, 1, 1), DARE, 1);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.BelowThreshold.selector, 2, 3));
        dares.resolve(DARE, 1, v13);
        // Four signatures, one duplicated, is still three distinct signers.
        dares.resolve(DARE, 1, votesFrom(arr(0, 1, 1, 2), DARE, 1));
        assertEq(uint8(dares.dareOf(DARE).status), uint8(DarefulDares.Status.Resolved));
    }

    function test_VoteForADifferentOutcomeDoesNotCount() public {
        _createWorked(DarefulDares.Stalemate.Arbitrate);
        bytes[] memory v = new bytes[](3);
        v[0] = signVote(users[0].governancePk, DARE, 1);
        v[1] = signVote(users[1].governancePk, DARE, 1);
        v[2] = signVote(users[2].governancePk, DARE, 0); // recovers to a non-quorum address under outcome 1
        vm.expectRevert();
        dares.resolve(DARE, 1, v);
    }

    function test_LedgerWalletCannotVote() public {
        _createWorked(DarefulDares.Stalemate.Arbitrate);
        bytes[] memory v = new bytes[](3);
        v[0] = signVote(users[0].ledgerPk, DARE, 1);
        v[1] = signVote(users[1].ledgerPk, DARE, 1);
        v[2] = signVote(users[2].ledgerPk, DARE, 1);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.NotInQuorum.selector, users[0].ledger));
        dares.resolve(DARE, 1, v);
    }

    function test_ResolveRejectsInvalidOutcomeAndSecondResolution() public {
        _createWorked(DarefulDares.Stalemate.Arbitrate);
        bytes[] memory v14 = votesFrom(arr(0, 1, 2), DARE, 2);
        vm.expectRevert(DarefulDares.BadOutcome.selector);
        dares.resolve(DARE, 2, v14);
        dares.resolve(DARE, 1, votesFrom(arr(0, 1, 2), DARE, 1));
        bytes[] memory v15 = votesFrom(arr(0, 1, 2), DARE, 0);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.NotLocked.selector, DARE));
        dares.resolve(DARE, 0, v15);
    }

    function test_QuorumForVoidMintsNothing() public {
        _createWorked(DarefulDares.Stalemate.Arbitrate);
        bytes[] memory v20 = votesFrom(arr(1, 2, 3), DARE, VOID_);
        vm.expectEmit(true, true, true, true);
        emit DarefulDares.DareVoided(DARE, 3);
        dares.resolve(DARE, VOID_, v20);
        assertEq(uint8(dares.dareOf(DARE).status), uint8(DarefulDares.Status.Voided));
        uint256[] memory idx = arr(0, 1, 2, 3);
        for (uint256 i = 0; i < 4; i++) {
            assertEq(netOf(i, USD, idx), 0);
        }
        bytes[] memory v16 = votesFrom(arr(0, 1, 2), DARE, 1);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.NotLocked.selector, DARE));
        dares.resolve(DARE, 1, v16);
    }

    // ------------------------------------------------------------------ scoring tables

    function test_ScoreBinaryTable() public view {
        assertEq(dares.scoreBinary(2000, 1), 3600);
        assertEq(dares.scoreBinary(7000, 1), 9100);
        assertEq(dares.scoreBinary(5000, 1), 7500);
        assertEq(dares.scoreBinary(0, 1), 0);
        assertEq(dares.scoreBinary(10000, 1), 10000);
        assertEq(dares.scoreBinary(10000, 0), 0);
        assertEq(dares.scoreBinary(0, 0), 10000);
        assertEq(dares.scoreBinary(7000, 0), 5100);
        assertEq(dares.scoreBinary(2000, 0), 9600);
        assertEq(dares.scoreBinary(5000, 0), 7500);
        assertEq(dares.scoreBinary(9999, 1), 10000, "1 bps off rounds to 10000 (1/10000 truncates)");
        assertEq(dares.scoreBinary(9900, 1), 9999);
    }

    function test_ScoreBinaryRejectsBadInputs() public {
        vm.expectRevert(DarefulDares.BadValue.selector);
        dares.scoreBinary(10001, 1);
        vm.expectRevert(DarefulDares.BadOutcome.selector);
        dares.scoreBinary(5000, 2);
    }

    function test_ScoreNumericTable() public view {
        assertEq(dares.scoreNumeric(50, 50, 100), 10000);
        assertEq(dares.scoreNumeric(60, 50, 100), 9000);
        assertEq(dares.scoreNumeric(40, 50, 100), 9000);
        assertEq(dares.scoreNumeric(0, 50, 100), 5000);
        assertEq(dares.scoreNumeric(150, 50, 100), 0, "at the edge of the range");
        assertEq(dares.scoreNumeric(151, 50, 100), 0, "beyond the range floors at zero");
        assertEq(dares.scoreNumeric(1, 0, 3), 6667);
        assertEq(dares.scoreNumeric(2, 0, 3), 3334);
        assertEq(dares.scoreNumeric(12, 12, 20), 10000);
        assertEq(dares.scoreNumeric(10, 12, 20), 9000);
        assertEq(dares.scoreNumeric(20, 12, 20), 6000);
    }

    function test_ScoreNumericRejectsZeroRange() public {
        vm.expectRevert(DarefulDares.BadRange.selector);
        dares.scoreNumeric(1, 1, 0);
    }

    function test_ScoreCategoricalTable() public view {
        // one-hot on the right option, three options
        assertEq(dares.scoreCategorical(0, 10000, 3, 0), 10000);
        // one-hot on the wrong option
        assertEq(dares.scoreCategorical(0, 10000, 3, 1), 0);
        assertEq(dares.scoreCategorical(1, 10000, 2, 0), 0);
        // pick 0 at 70%, others 15% each; outcome 0
        // (7000-10000)^2 + 1500^2 + 1500^2 = 9e6 + 2.25e6 + 2.25e6 = 13.5e6; / 20000 = 675
        assertEq(dares.scoreCategorical(0, 7000, 3, 0), 9325);
        // same distribution, outcome 1
        // 7000^2 + (1500-10000)^2 + 1500^2 = 49e6 + 72.25e6 + 2.25e6 = 123.5e6; / 20000 = 6175
        assertEq(dares.scoreCategorical(0, 7000, 3, 1), 3825);
        // four options at 50%: others get 5000 / 3 = 1666 each (remainder dropped)
        // outcome = pick: (5000-10000)^2 + 3 * 1666^2 = 25e6 + 8,326,668 = 33,326,668; / 20000 = 1666
        assertEq(dares.scoreCategorical(2, 5000, 4, 2), 8334);
        // uniform over two options is the same as 50% binary
        assertEq(dares.scoreCategorical(0, 5000, 2, 1), 7500);
        assertEq(dares.scoreCategorical(0, 5000, 2, 0), 7500);
    }

    function test_ScoreCategoricalRejectsBadInputs() public {
        vm.expectRevert(DarefulDares.BadOptions.selector);
        dares.scoreCategorical(0, 5000, 1, 0);
        vm.expectRevert(DarefulDares.BadValue.selector);
        dares.scoreCategorical(3, 5000, 3, 0);
        vm.expectRevert(DarefulDares.BadValue.selector);
        dares.scoreCategorical(0, 10001, 3, 0);
        vm.expectRevert(DarefulDares.BadOutcome.selector);
        dares.scoreCategorical(0, 5000, 3, 3);
    }

    function test_RoundDivIsHalfAwayFromZero() public view {
        assertEq(dares.roundDiv(5, 10), 1);
        assertEq(dares.roundDiv(-5, 10), -1);
        assertEq(dares.roundDiv(4, 10), 0);
        assertEq(dares.roundDiv(-4, 10), 0);
        assertEq(dares.roundDiv(15, 10), 2);
        assertEq(dares.roundDiv(-15, 10), -2);
        assertEq(dares.roundDiv(800_000, 30_000), 27);
        assertEq(dares.roundDiv(-800_000, 30_000), -27);
    }

    function test_PairwiseTransferMatchesHandComputation() public view {
        // Justin (1500 at 3600) vs Gabe (2000 at 9100), N = 4: 1500 * -5500 / 30000 = -275
        assertEq(dares.pairwiseTransfer(1500, 2000, 3600, 9100, 4), -275);
        assertEq(dares.pairwiseTransfer(2000, 1500, 9100, 3600, 4), 275);
        // Gabe vs Alex: 500 * 1600 / 30000 = 26.67 -> 27
        assertEq(dares.pairwiseTransfer(2000, 500, 9100, 7500, 4), 27);
        // Gabe vs John: 2000 * 9100 / 30000 = 606.67 -> 607
        assertEq(dares.pairwiseTransfer(2000, 5000, 9100, 0, 4), 607);
        // two-person market: the whole min stake moves on a full-confidence miss
        assertEq(dares.pairwiseTransfer(1000, 1000, 10000, 0, 2), 1000);
    }

    // ------------------------------------------------------------------ settlement

    function test_WorkedExampleFromSection8c() public {
        _createWorked(DarefulDares.Stalemate.Arbitrate);

        bytes[] memory vw = votesFrom(arr(0, 1, 2), DARE, 1);
        vm.expectEmit(true, true, true, true);
        emit DarefulDares.Scored(DARE, users[0].ledger, 3600);
        vm.expectEmit(true, true, true, true);
        emit DarefulDares.Scored(DARE, users[1].ledger, 9100);
        vm.expectEmit(true, true, true, true);
        emit DarefulDares.Scored(DARE, users[2].ledger, 7500);
        bytes[] memory v21 = votesFrom(arr(0, 1, 2), DARE, 1);
        vm.expectEmit(true, true, true, true);
        emit DarefulDares.Scored(DARE, users[3].ledger, 0);
        dares.resolve(DARE, 1, v21);

        // Every edge, from the lower scorer to the higher, rounded independently.
        assertEq(owed(0, 1, USD), 275, "Justin pays Gabe");
        assertEq(owed(0, 2, USD), 65, "Justin pays Alex");
        assertEq(owed(3, 0, USD), 180, "John pays Justin");
        assertEq(owed(2, 1, USD), 27, "Alex pays Gabe");
        assertEq(owed(3, 1, USD), 607, "John pays Gabe");
        assertEq(owed(3, 2, USD), 125, "John pays Alex");
        assertEq(owed(1, 0, USD) + owed(2, 0, USD) + owed(0, 3, USD) + owed(1, 2, USD) + owed(1, 3, USD) + owed(2, 3, USD), 0);

        uint256[] memory idx = arr(0, 1, 2, 3);
        assertEq(netOf(0, USD, idx), -160, "Justin");
        assertEq(netOf(1, USD, idx), 909, "Gabe (908.33 unrounded; per-transfer rounding gives 909)");
        assertEq(netOf(2, USD, idx), 163, "Alex");
        assertEq(netOf(3, USD, idx), -912, "John");
        assertEq(netOf(0, USD, idx) + netOf(1, USD, idx) + netOf(2, USD, idx) + netOf(3, USD, idx), 0);

        // The edges are real ledger obligations with derivable ids.
        bytes16 edge = dares.edgeObligationId(DARE, users[3].ledger, users[1].ledger);
        DarefulLedger.Obligation memory o = ledger.obligationOf(edge);
        assertEq(o.minted, 607);
        assertEq(o.creditor, users[1].ledger);
        assertEq(o.tokenId, ledger.fungibleId(GROUP, USD, users[3].ledger));
    }

    function test_LossBoundedByStakeUnderUnequalStakes() public {
        _createWorked(DarefulDares.Stalemate.Arbitrate);
        dares.resolve(DARE, 1, votesFrom(arr(0, 1, 2), DARE, 1));
        uint256[] memory idx = arr(0, 1, 2, 3);
        uint256[] memory stakes = arr(1500, 2000, 500, 5000);
        for (uint256 i = 0; i < 4; i++) {
            int256 n = netOf(i, USD, idx);
            assertLe(n < 0 ? uint256(-n) : uint256(n), stakes[i]);
        }
    }

    function test_SmallStakerAgainstWhalesLosesAtMostTheirStake() public {
        // $1 at 0% against three people with $100 each at 100%; it happens. The small staker's exposure is
        // capped at their $1 spread across three counterparties: 100 * 10000 / 30000 = 33.33 -> 33 each.
        DarefulDares.Dare memory d = _binary(DARE, DarefulDares.Stalemate.Arbitrate);
        (DarefulDares.Position[] memory ps, bytes[] memory sigs) = positionsFor(
            DARE, d.stalemate, arr(0, 1, 2, 3), arr(100, 10000, 10000, 10000), arr(0, 10000, 10000, 10000), noConf()
        );
        dares.create(d, ps, sigs, signCreate(users[0].ledgerPk, d));
        dares.resolve(DARE, 1, votesFrom(arr(1, 2, 3), DARE, 1));
        uint256[] memory idx = arr(0, 1, 2, 3);
        assertEq(netOf(0, USD, idx), -99);
        assertEq(netOf(1, USD, idx), 33);
        assertEq(netOf(2, USD, idx), 33);
        assertEq(netOf(3, USD, idx), 33);
    }

    function testFuzz_PairwiseTransferIsAntisymmetric(uint128 si, uint128 sj, uint16 a, uint16 b, uint8 n)
        public
        view
    {
        vm.assume(n >= 2);
        a = uint16(bound(a, 0, 10000));
        b = uint16(bound(b, 0, 10000));
        int256 t = dares.pairwiseTransfer(si, sj, a, b, n);
        int256 u = dares.pairwiseTransfer(sj, si, b, a, n);
        assertEq(t + u, 0);
    }

    function testFuzz_MarketIsZeroSumAfterRounding(uint64[4] memory stakes, uint16[4] memory values, bool outcome)
        public
    {
        DarefulDares.Dare memory d = _binary(DARE, DarefulDares.Stalemate.Arbitrate);
        uint256[] memory s = new uint256[](4);
        uint256[] memory v = new uint256[](4);
        for (uint256 i = 0; i < 4; i++) {
            s[i] = bound(uint256(stakes[i]), 1, 1_000_000);
            v[i] = bound(uint256(values[i]), 0, 10000);
        }
        (DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            positionsFor(DARE, d.stalemate, arr(0, 1, 2, 3), s, v, noConf());
        dares.create(d, ps, sigs, signCreate(users[0].ledgerPk, d));
        uint256 o = outcome ? 1 : 0;
        dares.resolve(DARE, o, votesFrom(arr(0, 1, 2), DARE, o));

        uint256[] memory idx = arr(0, 1, 2, 3);
        int256 sum;
        for (uint256 i = 0; i < 4; i++) {
            int256 n = netOf(i, USD, idx);
            sum += n;
            // Exact bound plus the rounding slack: each of the N - 1 transfers rounds by at most half a unit.
            uint256 mag = n < 0 ? uint256(-n) : uint256(n);
            assertLe(mag, s[i] + 1, "net within stake plus rounding slack");
        }
        assertEq(sum, 0, "zero-sum by antisymmetry, independent rounding included");
    }

    function test_NumericMarketSettlesByDistance() public {
        // Guess 10 and 20, actual 12, range 20: S = 9000 and 6000; $10 each; N = 2: 1000 * 3000 / 10000 = 300
        DarefulDares.Dare memory d = baseDare(DARE, DarefulDares.Kind.Numeric, USD, DarefulDares.Stalemate.Arbitrate, DEADLINE, 20, 0, 0);
        (DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            positionsFor(DARE, d.stalemate, arr(0, 1), arr(1000, 1000), arr(10, 20), noConf());
        dares.create(d, ps, sigs, signCreate(users[0].ledgerPk, d));
        dares.resolve(DARE, 12, votesFrom(arr(0, 1, 2), DARE, 12));
        assertEq(owed(1, 0, USD), 300);
        assertEq(owed(0, 1, USD), 0);
    }

    function test_NumericMarketRequiresRange() public {
        DarefulDares.Dare memory d = baseDare(DARE, DarefulDares.Kind.Numeric, USD, DarefulDares.Stalemate.Arbitrate, DEADLINE, 0, 0, 0);
        (DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            positionsFor(DARE, d.stalemate, arr(0, 1), arr(1000, 1000), arr(10, 20), noConf());
        bytes memory cs9 = signCreate(users[0].ledgerPk, d);
        vm.expectRevert(DarefulDares.BadRange.selector);
        dares.create(d, ps, sigs, cs9);
    }

    function test_CategoricalMarketSettles() public {
        // Three options. User 0 picks 0 at 70% (9325 if right), user 1 picks 1 at 100% (0 if wrong). Outcome 0.
        DarefulDares.Dare memory d = baseDare(DARE, DarefulDares.Kind.Categorical, USD, DarefulDares.Stalemate.Arbitrate, DEADLINE, 0, 3, 0);
        uint16[] memory conf = new uint16[](2);
        conf[0] = 7000;
        conf[1] = 10000;
        (DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            positionsFor(DARE, d.stalemate, arr(0, 1), arr(1000, 1000), arr(0, 1), conf);
        dares.create(d, ps, sigs, signCreate(users[0].ledgerPk, d));
        dares.resolve(DARE, 0, votesFrom(arr(0, 1, 2), DARE, 0));
        // 1000 * (9325 - 0) / 1 / 10000 = 932.5 -> 933
        assertEq(owed(1, 0, USD), 933);
    }

    function test_CategoricalRejectsOutOfRangePickAndOutcome() public {
        DarefulDares.Dare memory d = baseDare(DARE, DarefulDares.Kind.Categorical, USD, DarefulDares.Stalemate.Arbitrate, DEADLINE, 0, 3, 0);
        uint16[] memory conf = new uint16[](2);
        conf[0] = 7000;
        conf[1] = 10000;
        (DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            positionsFor(DARE, d.stalemate, arr(0, 1), arr(1000, 1000), arr(0, 3), conf);
        bytes memory cs10 = signCreate(users[0].ledgerPk, d);
        vm.expectRevert(DarefulDares.BadValue.selector);
        dares.create(d, ps, sigs, cs10);

        (ps, sigs) = positionsFor(DARE, d.stalemate, arr(0, 1), arr(1000, 1000), arr(0, 1), conf);
        dares.create(d, ps, sigs, signCreate(users[0].ledgerPk, d));
        bytes[] memory v17 = votesFrom(arr(0, 1, 2), DARE, 3);
        vm.expectRevert(DarefulDares.BadOutcome.selector);
        dares.resolve(DARE, 3, v17);
    }

    // ------------------------------------------------------------------ unquantifiable denominations

    function test_UnquantifiableForcesStakeOfOne() public {
        DarefulDares.Dare memory d = baseDare(DARE, DarefulDares.Kind.Binary, NEXT, DarefulDares.Stalemate.Arbitrate, DEADLINE, 0, 0, 0);
        (DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            positionsFor(DARE, d.stalemate, arr(0, 1), arr(1, 2), arr(2000, 8000), noConf());
        bytes memory cs11 = signCreate(users[0].ledgerPk, d);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.BadStake.selector, 1));
        dares.create(d, ps, sigs, cs11);
    }

    function test_UnquantifiableCollapsesToOneEdge() public {
        DarefulDares.Dare memory d = baseDare(DARE, DarefulDares.Kind.Binary, NEXT, DarefulDares.Stalemate.Arbitrate, DEADLINE, 0, 0, 0);
        (DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            positionsFor(DARE, d.stalemate, arr(0, 1, 2, 3), arr(1, 1, 1, 1), arr(2000, 7000, 5000, 0), noConf());
        dares.create(d, ps, sigs, signCreate(users[0].ledgerPk, d));
        dares.resolve(DARE, 1, votesFrom(arr(0, 1, 2), DARE, 1));
        // Lowest (John, 0) owes one next-time to the highest (Gabe, 9100). Nothing else moves.
        assertEq(owed(3, 1, NEXT), 1);
        uint256[] memory idx = arr(0, 1, 2, 3);
        assertEq(netOf(0, NEXT, idx), 0);
        assertEq(netOf(2, NEXT, idx), 0);
        assertEq(netOf(1, NEXT, idx), 1);
        assertEq(netOf(3, NEXT, idx), -1);
    }

    function test_UnquantifiableTieAtTopMintsNothing() public {
        DarefulDares.Dare memory d = baseDare(DARE, DarefulDares.Kind.Binary, NEXT, DarefulDares.Stalemate.Arbitrate, DEADLINE, 0, 0, 0);
        (DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            positionsFor(DARE, d.stalemate, arr(0, 1, 2), arr(1, 1, 1), arr(9000, 9000, 1000), noConf());
        dares.create(d, ps, sigs, signCreate(users[0].ledgerPk, d));
        dares.resolve(DARE, 1, votesFrom(arr(0, 1, 2), DARE, 1));
        uint256[] memory idx = arr(0, 1, 2);
        for (uint256 i = 0; i < 3; i++) {
            assertEq(netOf(i, NEXT, idx), 0);
        }
        assertEq(uint8(dares.dareOf(DARE).status), uint8(DarefulDares.Status.Resolved));
    }

    function test_UnquantifiableTieAtBottomMintsNothing() public {
        DarefulDares.Dare memory d = baseDare(DARE, DarefulDares.Kind.Binary, NEXT, DarefulDares.Stalemate.Arbitrate, DEADLINE, 0, 0, 0);
        (DarefulDares.Position[] memory ps, bytes[] memory sigs) =
            positionsFor(DARE, d.stalemate, arr(0, 1, 2), arr(1, 1, 1), arr(9000, 1000, 1000), noConf());
        dares.create(d, ps, sigs, signCreate(users[0].ledgerPk, d));
        dares.resolve(DARE, 1, votesFrom(arr(0, 1, 2), DARE, 1));
        uint256[] memory idx = arr(0, 1, 2);
        for (uint256 i = 0; i < 3; i++) {
            assertEq(netOf(i, NEXT, idx), 0);
        }
    }

    // ------------------------------------------------------------------ arbitration and expiry

    function test_ArbitrateIsGatedOnStalemateDeadlineAndRelayer() public {
        _createWorked(DarefulDares.Stalemate.Arbitrate);
        bytes32 ruling = keccak256("ruling");

        vm.prank(RELAYER);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.NotYetDue.selector, DEADLINE));
        dares.arbitrate(DARE, 1, false, ruling);

        vm.warp(DEADLINE + 1);
        vm.expectRevert(DarefulDares.NotRelayer.selector);
        dares.arbitrate(DARE, 1, false, ruling);

        vm.prank(RELAYER);
        vm.expectRevert(DarefulDares.ZeroId.selector);
        dares.arbitrate(DARE, 1, false, bytes32(0));

        vm.prank(RELAYER);
        vm.expectEmit(true, true, true, true);
        emit DarefulDares.DareArbitrated(DARE, 1, false, ruling);
        dares.arbitrate(DARE, 1, false, ruling);
        assertEq(uint8(dares.dareOf(DARE).status), uint8(DarefulDares.Status.Resolved));
        assertEq(dares.rulingHashOf(DARE), ruling);
        assertEq(owed(3, 1, USD), 607, "arbitration settles exactly like a quorum");
    }

    function test_ArbitrateRefusesAVoidStalemateMarket() public {
        _createWorked(DarefulDares.Stalemate.Void);
        vm.warp(DEADLINE + 1);
        vm.prank(RELAYER);
        vm.expectRevert(DarefulDares.StalemateMismatch.selector);
        dares.arbitrate(DARE, 1, false, keccak256("ruling"));
    }

    function test_ArbitrateVoidedMintsNothingAndRecordsTheRuling() public {
        _createWorked(DarefulDares.Stalemate.Arbitrate);
        vm.warp(DEADLINE + 1);
        bytes32 ruling = keccak256("the terms could not decide it");
        vm.prank(RELAYER);
        vm.expectEmit(true, true, true, true);
        emit DarefulDares.DareArbitrated(DARE, VOID_, true, ruling);
        dares.arbitrate(DARE, VOID_, true, ruling);
        assertEq(uint8(dares.dareOf(DARE).status), uint8(DarefulDares.Status.Voided));
        assertEq(dares.rulingHashOf(DARE), ruling);
        uint256[] memory idx = arr(0, 1, 2, 3);
        for (uint256 i = 0; i < 4; i++) {
            assertEq(netOf(i, USD, idx), 0);
        }
    }

    function test_ArbitrateRefusesAnAlreadyResolvedMarket() public {
        _createWorked(DarefulDares.Stalemate.Arbitrate);
        dares.resolve(DARE, 1, votesFrom(arr(0, 1, 2), DARE, 1));
        vm.warp(DEADLINE + 1);
        vm.prank(RELAYER);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.NotLocked.selector, DARE));
        dares.arbitrate(DARE, 0, false, keccak256("ruling"));
    }

    function test_ExpireIsGatedOnStalemateAndDeadline() public {
        _createWorked(DarefulDares.Stalemate.Void);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.NotYetDue.selector, DEADLINE));
        dares.expire(DARE);

        vm.warp(DEADLINE + 1);
        vm.expectEmit(true, true, true, true);
        emit DarefulDares.DareExpired(DARE);
        dares.expire(DARE);
        assertEq(uint8(dares.dareOf(DARE).status), uint8(DarefulDares.Status.Expired));
        uint256[] memory idx = arr(0, 1, 2, 3);
        for (uint256 i = 0; i < 4; i++) {
            assertEq(netOf(i, USD, idx), 0);
        }
        bytes[] memory v18 = votesFrom(arr(0, 1, 2), DARE, 1);
        vm.expectRevert(abi.encodeWithSelector(DarefulDares.NotLocked.selector, DARE));
        dares.resolve(DARE, 1, v18);
    }

    function test_ExpireRefusesAnArbitrateStalemateMarket() public {
        _createWorked(DarefulDares.Stalemate.Arbitrate);
        vm.warp(DEADLINE + 1);
        vm.expectRevert(DarefulDares.StalemateMismatch.selector);
        dares.expire(DARE);
    }

    function test_QuorumCanStillResolveAfterTheDeadline() public {
        _createWorked(DarefulDares.Stalemate.Void);
        vm.warp(DEADLINE + 1);
        dares.resolve(DARE, 1, votesFrom(arr(0, 1, 2), DARE, 1));
        assertEq(uint8(dares.dareOf(DARE).status), uint8(DarefulDares.Status.Resolved));
    }
}
