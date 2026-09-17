// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { DarefulLedger } from "./DarefulLedger.sol";

/// @title DarefulDares
/// @notice A market is a question with a scoring rule. Every participant states a value and a stake, every
///         participant is scored on accuracy after the fact with a proper scoring rule, and every pair settles
///         on the difference in their scores. No sides, no pot, no price, no house.
///
///         Invariants this contract enforces:
///         1. A market exists onchain only with every position, each carrying its owner's `Enter` signature,
///            landed in one call. There is no partially created market.
///         2. The quorum is the group's governance wallets as the ledger records them at creation. Calldata
///            cannot supply a quorum or a threshold.
///         3. An outcome is set only by `threshold` distinct governance signatures for that outcome, or by the
///            relayer's arbitration after the deadline under a rule every participant signed at entry.
///         4. Settlement is pairwise, rounded per transfer, antisymmetric, and every nonzero transfer becomes
///            one non-transferable obligation on the ledger, so nothing is ever held here.
contract DarefulDares is EIP712 {
    // ----------------------------------------------------------------------------------------------------
    // Types (PLANNING.md 5a)
    // ----------------------------------------------------------------------------------------------------

    enum Kind {
        Binary,
        Numeric,
        Categorical
    }

    enum Pace {
        Dare,
        Argument
    }

    enum Stalemate {
        Arbitrate,
        Void
    }

    enum Status {
        Locked,
        Resolved,
        Voided,
        Expired
    }

    /// @notice Sentinel outcome a quorum may vote for. Mints nothing; the toll applies.
    uint256 public constant VOID = type(uint256).max;
    uint256 public constant BPS = 10_000;
    /// @dev Keeps every intermediate product in the settlement arithmetic far inside int256.
    uint256 public constant MAX_STAKE = type(uint128).max;

    struct Dare {
        bytes32 id;
        bytes32 groupId;
        Kind kind;
        Pace pace;
        address creator; // ledger wallet
        bytes32 termsHash; // keccak256 of the human-approved terms text
        bytes32 denomId;
        uint256 range; // Numeric only: the plausible span
        uint8 options; // Categorical only: number of outcomes
        Stalemate stalemate; // set by creator, signed by every participant at entry
        address[] quorum; // governance wallets, read from the ledger at create, never caller-supplied
        uint8 threshold; // floor(quorum.length / 2) + 1
        uint64 resolvesBy;
        Status status;
        uint256 outcome; // 0 or 1 for Binary, the number for Numeric, the index for Categorical
    }

    struct Position {
        address ledger;
        uint256 stake; // units of denomId
        uint256 value; // probability in bps for Binary, the guess for Numeric, the option index for Categorical
        uint16 confidenceBps; // Categorical only; remaining mass spreads evenly over the other options
    }

    // ----------------------------------------------------------------------------------------------------
    // Events (PLANNING.md 5a)
    // ----------------------------------------------------------------------------------------------------

    event DareCreated(
        bytes32 indexed dareId,
        bytes32 indexed groupId,
        Kind kind,
        Pace pace,
        address creator,
        bytes32 termsHash,
        bytes32 denomId,
        uint256 range,
        uint8 options,
        Stalemate stalemate,
        uint64 resolvesBy
    );
    event Entered(bytes32 indexed dareId, address participant, uint256 stake, uint256 value, uint16 confidenceBps);
    event DareVoided(bytes32 indexed dareId, uint8 votes);
    event DareResolved(bytes32 indexed dareId, uint256 outcome, uint8 votes);
    event DareArbitrated(bytes32 indexed dareId, uint256 outcome, bool voided, bytes32 rulingHash);
    event DareExpired(bytes32 indexed dareId);
    event Scored(bytes32 indexed dareId, address participant, uint16 score);

    // ----------------------------------------------------------------------------------------------------
    // Errors
    // ----------------------------------------------------------------------------------------------------

    error NotRelayer();
    error ZeroAddress();
    error ZeroId();
    error DareExists(bytes32 dareId);
    error UnknownDare(bytes32 dareId);
    error NotLocked(bytes32 dareId);
    error TooFewPositions();
    error LengthMismatch();
    error BadCreatorSignature();
    error NotMember(address wallet);
    error BadEnterSignature(uint256 index);
    error DuplicatePosition(address wallet);
    error BadStake(uint256 index);
    error BadValue();
    error BadRange();
    error BadOptions();
    error BadOutcome();
    error QuorumTooLarge();
    error NotInQuorum(address signer);
    error BelowThreshold(uint256 votes, uint8 threshold);
    error StalemateMismatch();
    error NotYetDue(uint64 resolvesBy);

    // ----------------------------------------------------------------------------------------------------
    // Storage
    // ----------------------------------------------------------------------------------------------------

    DarefulLedger public immutable ledger;
    address public immutable relayer;

    mapping(bytes32 dareId => Dare) private _dares;
    mapping(bytes32 dareId => Position[]) private _positions;
    mapping(bytes32 dareId => mapping(address ledgerWallet => bool)) private _hasPosition;
    /// @notice keccak256 of the written arbitration ruling, so the ruling is auditable against the chain.
    mapping(bytes32 dareId => bytes32) public rulingHashOf;

    // ----------------------------------------------------------------------------------------------------
    // EIP-712
    // ----------------------------------------------------------------------------------------------------

    bytes32 public constant CREATE_TYPEHASH = keccak256(
        "Create(bytes32 dareId,bytes32 groupId,uint8 kind,uint8 pace,bytes32 termsHash,bytes32 denomId,uint256 range,uint8 options,uint8 stalemate,uint64 resolvesBy)"
    );
    bytes32 public constant ENTER_TYPEHASH =
        keccak256("Enter(bytes32 dareId,uint256 stake,uint256 value,uint16 confidenceBps,uint8 stalemate)");
    bytes32 public constant VOTE_TYPEHASH = keccak256("Vote(bytes32 dareId,uint256 outcome)");

    // ----------------------------------------------------------------------------------------------------
    // Constructor and roles
    // ----------------------------------------------------------------------------------------------------

    constructor(DarefulLedger ledger_, address relayer_) EIP712("DarefulDares", "1") {
        if (address(ledger_) == address(0) || relayer_ == address(0)) revert ZeroAddress();
        ledger = ledger_;
        relayer = relayer_;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    // ----------------------------------------------------------------------------------------------------
    // Views
    // ----------------------------------------------------------------------------------------------------

    function dareOf(bytes32 dareId) external view returns (Dare memory) {
        return _load(dareId);
    }

    function positionsOf(bytes32 dareId) external view returns (Position[] memory) {
        _load(dareId);
        return _positions[dareId];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice The obligation id a settled edge mints under, derived so the offchain shadow row can be
    ///         written with the same id before or after the chain write.
    function edgeObligationId(bytes32 dareId, address debtor, address creditor) public pure returns (bytes16) {
        return bytes16(keccak256(abi.encode(dareId, debtor, creditor)));
    }

    // ----------------------------------------------------------------------------------------------------
    // Lifecycle
    // ----------------------------------------------------------------------------------------------------

    /// @notice One atomic call at lock: the market plus every position with its owner's signature. The
    ///         quorum, threshold, status, and outcome fields of `d` are ignored and set here.
    function create(Dare calldata d, Position[] calldata ps, bytes[] calldata enterSigs, bytes calldata creatorSig)
        external
    {
        if (d.id == bytes32(0)) revert ZeroId();
        if (_dares[d.id].id != bytes32(0)) revert DareExists(d.id);
        if (ps.length < 2) revert TooFewPositions();
        if (enterSigs.length != ps.length) revert LengthMismatch();

        bytes32 createHash = keccak256(
            abi.encode(
                CREATE_TYPEHASH,
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
        if (ECDSA.recover(_hashTypedDataV4(createHash), creatorSig) != d.creator) revert BadCreatorSignature();
        if (!ledger.isLedgerMember(d.groupId, d.creator)) revert NotMember(d.creator);

        if (d.kind == Kind.Numeric && d.range == 0) revert BadRange();
        if (d.kind == Kind.Categorical && d.options < 2) revert BadOptions();

        bool quantifiable = ledger.denomOf(d.groupId, d.denomId).quantifiable; // reverts if unregistered

        // The quorum is the whole group at creation, read from the ledger. Calldata cannot supply it.
        address[] memory quorum = ledger.governanceOf(d.groupId);
        if (quorum.length > type(uint8).max) revert QuorumTooLarge();

        Dare storage s = _dares[d.id];
        s.id = d.id;
        s.groupId = d.groupId;
        s.kind = d.kind;
        s.pace = d.pace;
        s.creator = d.creator;
        s.termsHash = d.termsHash;
        s.denomId = d.denomId;
        s.range = d.range;
        s.options = d.options;
        s.stalemate = d.stalemate;
        s.quorum = quorum;
        s.threshold = uint8(quorum.length / 2 + 1);
        s.resolvesBy = d.resolvesBy;
        s.status = Status.Locked;
        s.outcome = 0;

        emit DareCreated(
            d.id, d.groupId, d.kind, d.pace, d.creator, d.termsHash, d.denomId, d.range, d.options, d.stalemate, d.resolvesBy
        );

        for (uint256 i = 0; i < ps.length; i++) {
            _enter(d, i, ps[i], enterSigs[i], quantifiable);
        }
    }

    /// @notice Anyone may submit. Recovers each vote, requires every signer to be in the quorum, deduplicates
    ///         by signer, and requires at least `threshold` votes for `outcome`. `VOID` voids the market.
    function resolve(bytes32 dareId, uint256 outcome, bytes[] calldata votes) external {
        Dare storage s = _load(dareId);
        if (s.status != Status.Locked) revert NotLocked(dareId);
        if (outcome != VOID) _requireValidOutcome(s, outcome);

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(VOTE_TYPEHASH, dareId, outcome)));
        address[] memory seen = new address[](votes.length);
        uint256 count = 0;
        for (uint256 i = 0; i < votes.length; i++) {
            address signer = ECDSA.recover(digest, votes[i]);
            if (!_inQuorum(s, signer)) revert NotInQuorum(signer);
            bool duplicate = false;
            for (uint256 j = 0; j < count; j++) {
                if (seen[j] == signer) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) {
                seen[count] = signer;
                count++;
            }
        }
        if (count < s.threshold) revert BelowThreshold(count, s.threshold);

        if (outcome == VOID) {
            s.status = Status.Voided;
            emit DareVoided(dareId, uint8(count));
            return;
        }
        s.status = Status.Resolved;
        s.outcome = outcome;
        emit DareResolved(dareId, outcome, uint8(count));
        _settle(s);
    }

    /// @notice Relayer only, after `resolvesBy`, only under the Arbitrate rule every participant signed at
    ///         entry. `voided == true` means the terms could not decide it: nothing mints, the toll applies.
    function arbitrate(bytes32 dareId, uint256 outcome, bool voided, bytes32 rulingHash) external onlyRelayer {
        Dare storage s = _load(dareId);
        if (s.status != Status.Locked) revert NotLocked(dareId);
        if (s.stalemate != Stalemate.Arbitrate) revert StalemateMismatch();
        if (block.timestamp <= s.resolvesBy) revert NotYetDue(s.resolvesBy);
        if (rulingHash == bytes32(0)) revert ZeroId();

        rulingHashOf[dareId] = rulingHash;
        if (voided) {
            s.status = Status.Voided;
            emit DareArbitrated(dareId, outcome, true, rulingHash);
            return;
        }
        _requireValidOutcome(s, outcome);
        s.status = Status.Resolved;
        s.outcome = outcome;
        emit DareArbitrated(dareId, outcome, false, rulingHash);
        _settle(s);
    }

    /// @notice Anyone, after `resolvesBy` with no resolution, only under the Void rule. Mints nothing, no toll.
    function expire(bytes32 dareId) external {
        Dare storage s = _load(dareId);
        if (s.status != Status.Locked) revert NotLocked(dareId);
        if (s.stalemate != Stalemate.Void) revert StalemateMismatch();
        if (block.timestamp <= s.resolvesBy) revert NotYetDue(s.resolvesBy);
        s.status = Status.Expired;
        emit DareExpired(dareId);
    }

    // ----------------------------------------------------------------------------------------------------
    // Scoring (basis points, 0 to 10000; every rule is proper, so stating your belief maximizes payout)
    // ----------------------------------------------------------------------------------------------------

    /// @notice Brier on a probability: S = 10000 - (value - outcome * 10000)^2 / 10000.
    function scoreBinary(uint256 valueBps, uint256 outcome) public pure returns (uint16) {
        if (valueBps > BPS) revert BadValue();
        if (outcome > 1) revert BadOutcome();
        uint256 target = outcome * BPS;
        uint256 diff = valueBps > target ? valueBps - target : target - valueBps;
        return uint16(BPS - (diff * diff) / BPS);
    }

    /// @notice Absolute error over the range: S = max(0, 10000 - |value - outcome| * 10000 / range).
    function scoreNumeric(uint256 value, uint256 outcome, uint256 range) public pure returns (uint16) {
        if (range == 0) revert BadRange();
        uint256 diff = value > outcome ? value - outcome : outcome - value;
        if (diff >= range) return 0;
        return uint16(BPS - (diff * BPS) / range);
    }

    /// @notice Brier on a distribution, all in bps: S = 10000 - sum_k (p_k - o_k)^2 / 20000, where p_pick is
    ///         `confidenceBps` and the other options share the rest evenly (integer division; the remainder
    ///         is dropped). A correct one-hot scores 10000, a wrong one-hot scores 0.
    function scoreCategorical(uint256 pick, uint16 confidenceBps, uint8 options, uint256 outcome)
        public
        pure
        returns (uint16)
    {
        if (options < 2) revert BadOptions();
        if (pick >= options || confidenceBps > BPS) revert BadValue();
        if (outcome >= options) revert BadOutcome();
        int256 other = int256((BPS - confidenceBps) / (uint256(options) - 1));
        int256 conf = int256(uint256(confidenceBps));
        uint256 sum = 0;
        for (uint256 k = 0; k < options; k++) {
            int256 p = k == pick ? conf : other;
            int256 o = k == outcome ? int256(BPS) : int256(0);
            int256 dlt = p - o;
            sum += uint256(dlt * dlt);
        }
        return uint16(BPS - sum / (2 * BPS));
    }

    /// @notice One pairwise transfer in whole units, positive meaning `j` pays `i`:
    ///         round(min(s_i, s_j) * (S_i - S_j) / (N - 1) / 10000), rounded half away from zero, so
    ///         transfer(i, j) == -transfer(j, i) exactly and the market sums to zero.
    function pairwiseTransfer(uint256 stakeI, uint256 stakeJ, uint16 scoreI, uint16 scoreJ, uint256 n)
        public
        pure
        returns (int256)
    {
        if (n < 2) revert TooFewPositions();
        if (stakeI > MAX_STAKE || stakeJ > MAX_STAKE) revert BadValue();
        uint256 minStake = stakeI < stakeJ ? stakeI : stakeJ;
        int256 raw = int256(minStake) * (int256(uint256(scoreI)) - int256(uint256(scoreJ)));
        return roundDiv(raw, int256((n - 1) * BPS));
    }

    /// @notice Integer division rounded to the nearest whole, half away from zero. `d` must be positive.
    function roundDiv(int256 x, int256 d) public pure returns (int256) {
        if (d <= 0) revert BadValue();
        if (x >= 0) return (x + d / 2) / d;
        return -((-x + d / 2) / d);
    }

    // ----------------------------------------------------------------------------------------------------
    // Internals
    // ----------------------------------------------------------------------------------------------------

    function _enter(Dare calldata d, uint256 i, Position calldata p, bytes calldata sig, bool quantifiable)
        private
    {
        bytes32 enterHash =
            keccak256(abi.encode(ENTER_TYPEHASH, d.id, p.stake, p.value, p.confidenceBps, uint8(d.stalemate)));
        if (ECDSA.recover(_hashTypedDataV4(enterHash), sig) != p.ledger) revert BadEnterSignature(i);
        if (!ledger.isLedgerMember(d.groupId, p.ledger)) revert NotMember(p.ledger);
        if (_hasPosition[d.id][p.ledger]) revert DuplicatePosition(p.ledger);

        if (quantifiable) {
            if (p.stake == 0 || p.stake > MAX_STAKE) revert BadStake(i);
        } else if (p.stake != 1) {
            // An unquantifiable denomination forces every stake to 1.
            revert BadStake(i);
        }

        if (d.kind == Kind.Binary) {
            if (p.value > BPS) revert BadValue();
        } else if (d.kind == Kind.Categorical) {
            if (p.value >= d.options || p.confidenceBps > BPS) revert BadValue();
        }

        _hasPosition[d.id][p.ledger] = true;
        _positions[d.id].push(p);
        emit Entered(d.id, p.ledger, p.stake, p.value, p.confidenceBps);
    }

    function _load(bytes32 dareId) private view returns (Dare storage s) {
        s = _dares[dareId];
        if (s.id == bytes32(0)) revert UnknownDare(dareId);
    }

    function _inQuorum(Dare storage s, address who) private view returns (bool) {
        uint256 n = s.quorum.length;
        for (uint256 i = 0; i < n; i++) {
            if (s.quorum[i] == who) return true;
        }
        return false;
    }

    function _requireValidOutcome(Dare storage s, uint256 outcome) private view {
        if (outcome == VOID) revert BadOutcome();
        if (s.kind == Kind.Binary && outcome > 1) revert BadOutcome();
        if (s.kind == Kind.Categorical && outcome >= s.options) revert BadOutcome();
    }

    function _score(Dare storage s, Position storage p) private view returns (uint16) {
        if (s.kind == Kind.Binary) return scoreBinary(p.value, s.outcome);
        if (s.kind == Kind.Numeric) return scoreNumeric(p.value, s.outcome, s.range);
        return scoreCategorical(p.value, p.confidenceBps, s.options, s.outcome);
    }

    /// @dev Score everyone, then settle every pair. Each nonzero transfer is one edge on the ledger from the
    ///      lower scorer to the higher. Unquantifiable denominations collapse to a single edge: the lowest
    ///      scorer owes one unit to the highest, and a tie at either end mints nothing.
    function _settle(Dare storage s) private {
        Position[] storage ps = _positions[s.id];
        uint256 n = ps.length;
        uint16[] memory scores = new uint16[](n);
        for (uint256 i = 0; i < n; i++) {
            scores[i] = _score(s, ps[i]);
            emit Scored(s.id, ps[i].ledger, scores[i]);
        }

        if (!ledger.denomOf(s.groupId, s.denomId).quantifiable) {
            _settleSingleEdge(s, ps, scores);
            return;
        }

        for (uint256 i = 0; i < n; i++) {
            for (uint256 j = i + 1; j < n; j++) {
                int256 t = pairwiseTransfer(ps[i].stake, ps[j].stake, scores[i], scores[j], n);
                if (t > 0) {
                    _mintEdge(s, ps[j].ledger, ps[i].ledger, uint256(t));
                } else if (t < 0) {
                    _mintEdge(s, ps[i].ledger, ps[j].ledger, uint256(-t));
                }
            }
        }
    }

    function _settleSingleEdge(Dare storage s, Position[] storage ps, uint16[] memory scores) private {
        uint256 hi = 0;
        uint256 lo = 0;
        bool hiTie = false;
        bool loTie = false;
        for (uint256 i = 1; i < scores.length; i++) {
            if (scores[i] > scores[hi]) {
                hi = i;
                hiTie = false;
            } else if (scores[i] == scores[hi]) {
                hiTie = true;
            }
            if (scores[i] < scores[lo]) {
                lo = i;
                loTie = false;
            } else if (scores[i] == scores[lo]) {
                loTie = true;
            }
        }
        if (hiTie || loTie || hi == lo) return;
        _mintEdge(s, ps[lo].ledger, ps[hi].ledger, 1);
    }

    function _mintEdge(Dare storage s, address debtor, address creditor, uint256 qty) private {
        ledger.mintFromDare(s.groupId, s.denomId, debtor, creditor, qty, edgeObligationId(s.id, debtor, creditor));
    }
}
