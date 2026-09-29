/**
 * Every screen's information sheet (docs/design.md 10.6), written from the code, since the code is the final word
 * on what a screen does. One sheet per screen and state; kinds of market share a sheet with the entries that
 * differ swapped in (10.8). Each holds to 10.4 to 10.7: the four groups in order, a term of five words at most,
 * one sentence of at most 90 characters, sixteen entries at most, gestures and icons named by fixed words, a
 * label the screen already shows never narrated, and the fixed line word for word. `sheetProblems` (info.ts) is
 * the lint over them, run by the unit suite with the copy scan. The shared gestures, pulling down to re-read and
 * the back control, are on Now's sheet and nowhere else.
 */
import type { InfoEntry, InfoSheet } from "./info";

const e = (term: string, description: string, extra: Partial<InfoEntry> = {}): InfoEntry => ({ term, description, ...extra });

/** A market while it's open (10.8): someone not yet in and someone in, since both are the open market; the swaps for the other kinds. */
function marketOpen(kind: "binary" | "numeric" | "categorical"): InfoSheet {
  const entry = kind === "numeric" ? e("Tap the number", "Type your number; − and + step it, and holding either repeats.") : kind === "categorical" ? e("Tap an answer", "Picks it; tap another to move your pick.") : e("Drag along the odds line", "Sets your odds from 0% to 100%; a tap anywhere on the line jumps there.");
  const sheet = kind === "categorical" ? e("Swipe the sheet down", "Lowers it to a bar so the terms behind six answers can be read.") : e("Swipe the sheet", "Up shows your stake and the move that gets you in; down lowers it to read the market.");
  return {
    name: "A market, while it’s open",
    groups: {
      Gestures: [e("Tap the avatars", "Opens who’s in: everyone in, and anyone still out, each with a nudge beside them.", { qualifier: "once you’re in" }), sheet, entry],
      Icons: [
        e("More", "Beside this sheet’s icon: the rest of the market’s details, and how it gets decided.", { glyph: "more" }),
        e("Share", "Sends the market’s link to a chat, with the question as its picture.", { glyph: "share", qualifier: "once you’re in" }),
        e("Copy the link", "Copies it; the icon turns to a check for a moment.", { glyph: "copy", qualifier: "once you’re in" }),
        e("Show a code to scan", "A code a friend scans with their own phone to open this market.", { glyph: "code", qualifier: "once you’re in" }),
        e("Pass the phone", "A friend with an account gets in on your phone with their PIN.", { glyph: "pass", qualifier: "once you’re in" }),
      ],
      "Rules and timing": [
        e("Your entry", "Yours to change until the close, from Change on your entry line.", { qualifier: "once you’re in" }),
        e("Where everyone landed", "Shows once you’re in, never before."),
        e("Your answer", "Final once you’re in, and then you see everyone’s.", { qualifier: "in a blind market" }),
        e("The close", "The time above the question: after it nobody gets in or changes; people say what happened."),
        e("Photos", "Add them any time from the bottom of the screen; everyone in it sees them.", { qualifier: "once you’re in" }),
        e("How it settles", "You settle only with people who land closer than you, and only by the gap between you."),
      ],
      "Everything else": [
        e("Remove, in who’s in", "Takes out an entry from someone without an account, until the close.", { qualifier: "if you asked it" }),
        e("Close it with 4", "Closes it early; whoever isn’t in yet can’t get in after.", { qualifier: "if you asked it" }),
      ],
    },
  };
}

/** A market once it has closed: saying what happened, and calling it. */
function marketVoting(kind: "binary" | "numeric" | "categorical"): InfoSheet {
  const say = kind === "numeric" ? e("The number field", "In the sheet: type what it was, and a number that differs from the read is a vote for it.") : kind === "categorical" ? e("The answers", "Tap the one that happened; the sheet raises to say it, with a photo or a screenshot.") : e("The two answers", "Tap what happened; the sheet raises to say it, with a photo or a screenshot.");
  return {
    name: "A market, while it’s called",
    groups: {
      Gestures: [e("Tap the avatars", "Opens who’s in, and who still has to call it, each with a nudge beside them.")],
      Icons: [e("More", "The rest of the details, how it gets decided, and what anyone attached.", { glyph: "more" }), e("Share", "Sends the market’s link to a chat.", { glyph: "share" }), e("Copy the link", "Copies it; the icon turns to a check for a moment.", { glyph: "copy" })],
      "Rules and timing": [
        e("Closed", "Nobody gets in or changes now; whoever saw it says what happened first."),
        e("Calling it", "Your vote only ever comes from your own phone, and a majority settles it."),
        e("The read", "The app leans one way from what was said; the line under it says how many agree."),
        e("The tiebreaker", "After the deadline, hears both sides and calls it, as everyone agreed on entering.", { qualifier: "if the terms name one" }),
        e("Photos", "Everyone in it sees them; a clip on the claim stays on the claim."),
      ],
      "Everything else": [
        say,
        e("Not how I saw it", "Picks the other way, or nobody can tell."),
        e("Change, on your line", "Reopens your vote while it’s undecided."),
        e("Nudge them", "Reaches whoever hasn’t called it yet, once per six hours."),
        e("Add what you saw", "Your case for the tiebreaker, once it’s deadlocked.", { qualifier: "in a deadlock" }),
      ],
    },
  };
}

export const INFO_SHEETS: Record<string, InfoSheet> = {
  now: {
    name: "Now",
    groups: {
      Gestures: [
        e("Swipe down from the top", "Re-reads the screen, on every screen; the line under the status bar runs meanwhile."),
        e("Swipe left on a row", "A question you asked that nobody else is in: Remove; a finished one: Archive."),
      ],
      Icons: [e("Ask something", "Opens the question step, rising over Now; the tab bar is just covered.", { glyph: "plus" }), e("Back, on other screens", "Lands on the tab you came from, never further back.", { glyph: "back" })],
      "Rules and timing": [
        e("Needs you", "Only what you can finish now, time-bound first; the yellow dot marks the soonest."),
        e("Running", "Your questions in flight, with your number until the close and the clock alone after."),
        e("Just happened", "What the group did, newest first; a tap opens the question or the person."),
      ],
      "Everything else": [
        e("Got a code?", "Opens the code screen: six characters a friend read you join their question."),
        e("A row’s verb", "Enter, Vote, Close, Yep, Finish or That’s me opens the thing at its move."),
        e("The tab you’re on", "Tapped again, brings the screen back to the top."),
      ],
    },
  },
  "now-first-run": {
    name: "Now, before anything",
    groups: {
      Gestures: [e("Swipe down from the top", "Re-reads the screen, on every screen.")],
      "Rules and timing": [e("Nothing yet", "Nothing shows here until somebody else is in something with you.")],
      "Everything else": [
        e("Ask something", "Opens the question step; it comes back here once your friends are in."),
        e("The six boxes", "Type or paste a code a friend read you; Join opens their question."),
        e("Got a link?", "Reads a market link off your clipboard, or takes one typed."),
        e("A game row", "Opens the game to ask your friends something about it."),
      ],
    },
  },
  "whats-on": {
    name: "What’s on",
    groups: {
      "Rules and timing": [
        e("Most asked", "Shows once ten groups of friends are on a game; below that, the schedule alone."),
        e("What a row says", "How much a game is used, and your own use; never what anyone thinks."),
        e("New games", "Arrive on their own a few days ahead; nothing here badges the tab."),
      ],
      "Everything else": [e("A game row", "Opens the game with your friends’ questions on it, or the start of one with them.")],
    },
  },
  people: {
    name: "People",
    groups: {
      "Rules and timing": [
        e("Who gets a row", "Anyone with something open with you; everyone square shares one line."),
        e("Not here yet", "Someone you logged things for before they signed in, in grey with a dashed ring."),
      ],
      "Everything else": [e("The square row", "Opens to list everyone who’s square with you, each opening their page."), e("A person", "Opens what’s between you two, and the move to log a cover.")],
    },
  },
  you: {
    name: "You",
    groups: {
      "Rules and timing": [
        e("How your calls land", "Draws from ten resolved yes-or-no calls; under ten it lists them."),
        e("What this never is", "No score, grade or rank, and nobody else sees any of it."),
      ],
      "Everything else": [
        e("Your units and marks", "Read-only sheets of what you’ve used on covers and questions."),
        e("Appearance", "Match your phone, always dark, or always light; kept on this phone only."),
        e("Pass the phone", "Lets you get into a market from a friend’s phone with a PIN; off wipes it."),
        e("Sign out", "Asks once; everything stays where it is."),
        e("Measure the screen", "An instrument for the phone check of the tab bar; it leaves with the cause."),
      ],
    },
  },
  "market-draft": {
    name: "A question, not sent yet",
    groups: {
      Icons: [e("More", "The details as they’ll read, and the colour behind the mark to pick.", { glyph: "more" })],
      "Rules and timing": [e("Not sent yet", "Nobody sees it until you send it; the dashed line around the question says so.")],
      "Everything else": [e("I’m in, at the bottom", "Gets you in and sends it to everyone you picked, at once.")],
    },
  },
  "market-open": marketOpen("binary"),
  "market-open-number": marketOpen("numeric"),
  "market-open-pick": marketOpen("categorical"),
  "market-voting": marketVoting("binary"),
  "market-voting-number": marketVoting("numeric"),
  "market-voting-pick": marketVoting("categorical"),
  "market-ended": {
    name: "A market, once it’s over",
    groups: {
      Gestures: [e("Tap a photo", "Opens it full screen, with the rest to swipe through.")],
      Icons: [e("More", "The details, how it got decided, and what anyone attached.", { glyph: "more" }), e("Share", "Sends how it ended to a chat, with the result as its picture.", { glyph: "share", qualifier: "if it settled" })],
      "Rules and timing": [
        e("Closest first", "Everyone ranked by how close they were; ties share a rank."),
        e("Who’s got who", "What changed hands, each outlined in its person’s colour; nobody won or lost by name."),
        e("Void or never settled", "Nothing changes hands, and it counts against nobody."),
      ],
      "Everything else": [
        e("The plus after the photos", "Adds a photo from the night, weeks later included; with none, Add the first photo.", { qualifier: "if you were in" }),
        e("Settled, on your row", "Closes what someone’s got you and asks for a photo of it; Call it even closes it too."),
      ],
    },
  },
  "market-memory": {
    name: "A memory",
    groups: {
      Gestures: [e("Tap a photo", "Opens it full screen, with the rest to swipe through.")],
      Icons: [e("More", "The details, how it got decided, and what anyone attached.", { glyph: "more" }), e("Share", "Sends how it ended to a chat.", { glyph: "share", qualifier: "if it settled" })],
      "Rules and timing": [e("The date above the question", "From the second day on, this is the memory it left, photos first."), e("The rest of that night", "Other things within six hours with the same people, oldest first.")],
      "Everything else": [e("The plus after the photos", "Adds a photo from that night, any time; with none, Add the first photo.", { qualifier: "if you were in" })],
    },
  },
  "market-link": {
    name: "A question, from a link",
    groups: {
      "Rules and timing": [
        e("No account needed", "A name is enough to get in; a number lets your entry find you when you sign in."),
        e("Names after two letters", "A name someone already joined with needs the number they gave."),
        e("Blind", "Your answer is final once made, and then you see everyone’s.", { qualifier: "in a blind market" }),
      ],
      "Everything else": [e("Who’s joining?", "The step after your number: your name, and a number if you give one."), e("Have an account? Sign in", "Keeps this entry as yours."), e("Get in as yourself", "Signed in, this phone is you, and Not you signs it out first.", { qualifier: "signed in" })],
    },
  },
  person: {
    name: "A person",
    groups: {
      Gestures: [e("Tap a story", "Opens the question it came from.")],
      "Rules and timing": [
        e("The header", "What’s open each way, the same unit netted; never a zero."),
        e("Coming up", "What’s still ahead between you two; the past folds past twelve behind Show earlier."),
        e("Who picked up last", "The last twelve pick-ups nobody expects to settle, in order, never a count."),
      ],
      "Everything else": [
        e("I got this one", "In the sheet: logs a cover for this person, what, how many, and a note only you see."),
        e("Cancel out, under the header", "The same unit both ways cancels by the smaller side, from either of you."),
        e("A cover of yours", "Opens Settled, which asks for a photo of it, and Call it even beside it."),
        e("Where you two turn up", "Tap a name to see only what came out of those people; Clear shows it all again."),
      ],
    },
  },
  "person-ghost": {
    name: "Someone not here yet",
    groups: {
      "Rules and timing": [e("Not here yet", "What you logged waits under this name until they sign in with the number.")],
      "Everything else": [
        e("Make a link for them", "A link that shows them what’s waiting and lets them keep it."),
        e("Someone I already have", "Merges what’s here into a person you know."),
        e("Let them go", "Dismisses this name; the number is forgotten with it."),
      ],
    },
  },
  game: {
    name: "A game",
    groups: {
      Icons: [e("More", "Every question’s terms, as they’ll be read.", { glyph: "more" })],
      "Rules and timing": [
        e("Kickoff", "Every question closes when the game starts."),
        e("No number until you’re in", "A card shows where a question stands only once you’re in it."),
        e("The final score", "Settles a question nobody votes on, a day after the game."),
      ],
      "Everything else": [e("The names under the game", "Switch between the groups of friends you’ve asked about this game."), e("Add another", "One more question from the menu, until kickoff."), e("A question card", "Opens that question’s own screen.")],
    },
  },
  "game-link": {
    name: "A game, from a link",
    groups: {
      "Rules and timing": [e("No account needed", "Each question opens its own screen, where a name is enough to get in.")],
      "Everything else": [e("Open, on a question", "Opens that question’s own screen, where you get in.")],
    },
  },
  "game-night": {
    name: "The night of a game",
    groups: {
      Gestures: [e("Tap a photo", "Opens it full screen, with the rest to swipe through.")],
      "Rules and timing": [e("The final score", "Titles the night; who’s got who sums up every question across it.")],
      "Everything else": [e("The plus after the photos", "Adds a photo from the night.", { qualifier: "if you were in" })],
    },
  },
  "game-start": {
    name: "Starting a game",
    groups: {
      "Rules and timing": [e("Who wins", "Ticked when the page opens; tick the rest of the menu as you like."), e("One stake", "Covers every question you tick; if nobody votes, the final score settles it.")],
      "Everything else": [e("Send it", "Opens every ticked question at once, all closing at kickoff.")],
    },
  },
  claimant: {
    name: "What was waiting for you",
    groups: {
      "Rules and timing": [
        e("Covers logged against you", "Start unpressed: you confirm each one with a deliberate yep."),
        e("Entries from a link", "Start pressed, since you made them; unpressed, they stay under the typed name."),
      ],
      "Everything else": [e("The checks", "Pick what’s right; the Yep at the bottom counts what you picked and confirms it together.")],
    },
  },
  code: {
    name: "Got a code?",
    groups: {
      "Rules and timing": [e("A code", "Six characters, no O, I, Z, zero or one; one per question, dead once it closes.")],
      "Everything else": [e("Paste a link", "Reads a market link off your clipboard and opens it; or type one.")],
    },
  },
  "claim-landing": {
    name: "Someone added you",
    groups: {
      "Rules and timing": [e("A link never signs in", "It’s the sender’s claim about who you are; keeping it is your say.")],
      "Everything else": [e("That’s me", "Keeps these under your name on this phone."), e("Sign in", "Signs in with a number or an email; what’s here follows you.")],
    },
  },
  cover: {
    name: "A cover",
    groups: {
      "Rules and timing": [e("Nothing until you say yep", "Nothing is on the ledger until you confirm it, from your own phone.")],
      "Everything else": [e("Yep, that’s right", "Confirms it; it lands on the person view with them."), e("Not this one", "Leaves it out; the person who logged it hears.")],
    },
  },
  "cover-link": {
    name: "A cover, from a link",
    groups: {
      "Rules and timing": [e("Sign in to see it", "Nothing counts until you say so, once signed in.")],
      "Everything else": [e("Sign in", "A number or an email is all it takes.")],
    },
  },
  "ask-question": {
    name: "Asking",
    groups: {
      Icons: [e("Close", "Closes asking and returns you exactly where you were.", { glyph: "close" })],
      "Rules and timing": [
        e("Ask me three things first", "Three yes-or-no questions before the terms, for when a lot rides on it."),
        e("A named subject", "A name the app can’t place asks what it is, in one tap, before the three."),
        e("Next: who’s in", "Starts writing the terms while you pick who’s in."),
      ],
      "Everything else": [
        e("Add a mark", "Opens the picker; the mark picks the question’s colour everywhere."),
        e("Got a code?", "Opens the code screen to join a friend’s question instead."),
        e("Pick one", "Two to six answers, a few words each or a person you know here."),
      ],
    },
  },
  "ask-who": {
    name: "Who’s in",
    groups: {
      Icons: [e("Back", "Returns to the question, with everything kept.", { glyph: "back" })],
      "Rules and timing": [e("The people you asked last", "Preselected, since it’s usually the same people; everyone picked gets the link.")],
      "Everything else": [
        e("Whoever I send it to", "Starts as just you, and grows as people join by link or code."),
        e("Someone else", "Pick people you already share something with, one by one."),
        e("Want to call them something?", "Asked under the same people’s second question; Not now never blocks."),
        e("Edit, beside your question", "Back to the question."),
      ],
    },
  },
  "ask-terms": {
    name: "The terms",
    groups: {
      Icons: [e("Back", "Returns to who’s in; the writing carries on.", { glyph: "back" })],
      "Rules and timing": [
        e("Written in front of you", "The words arrive as they’re written; Still writing at three seconds, Try again at ten."),
        e("Everyone reads these", "Exactly these words, before they’re in; entering accepts the tiebreaker rule."),
        e("Scored on", "How far off scores nothing; blank leaves it to the app, and then it’s never shown.", { qualifier: "on a number question" }),
      ],
      "Everything else": [
        e("Counts if", "Editable once written, and not before."),
        e("Where everyone landed", "Hidden keeps everyone’s number back until it closes, and makes yours final."),
        e("Send it", "Opens the question and takes you to its screen."),
      ],
    },
  },
  "ask-careful": {
    name: "Three quick ones",
    groups: {
      Icons: [e("Back", "Returns to the question, with everything kept.", { glyph: "back" })],
      "Rules and timing": [e("Only you see these", "The three answers shape the terms; nobody else reads them.")],
      "Everything else": [e("Change, on the subject line", "Reopens what the name is: a person, a pet, or something else.")],
    },
  },
  photo: {
    name: "A photo",
    groups: {
      Gestures: [e("Swipe sideways", "Moves through the market’s photos in the order the market shows them."), e("Hold a photo", "The phone’s own Copy Subject, for a sticker to paste here.")],
      Icons: [e("Close", "Returns to the market.", { glyph: "close" })],
      "Everything else": [
        e("Make a sticker", "Cuts what you tap, right here, and keeps it with your marks."),
        e("Save", "Saves it to your phone through the share sheet."),
        e("Remove", "Takes a photo you added off the market.", { qualifier: "your own" }),
      ],
    },
  },
};

export function infoSheet(key: string): InfoSheet | null {
  return INFO_SHEETS[key] ?? null;
}
