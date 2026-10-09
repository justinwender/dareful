/**
 * Every screen's information sheet (docs/design.md 10.6), written from the code, since the code is the final word
 * on what a screen does. One sheet per screen and state; kinds of market share a sheet with the entries that
 * differ swapped in (10.8). Each holds to 10.4 to 10.7: the four groups in order, a term of five words at most,
 * one sentence of at most 90 characters, sixteen entries at most, gestures and icons named by fixed words, a
 * label the screen already shows never narrated, and the fixed line word for word. `sheetProblems` (info.ts) is
 * the lint over them, run by the unit suite with the copy scan. The shared gestures, pulling down to re-read and
 * the back control, are on Now's sheet and nowhere else. Every entry was read against the screen in the QA round
 * (2026-09-29): what a sheet says is what the code does, and what a person can do on a screen and would not find
 * is on its sheet.
 */
import type { InfoEntry, InfoSheet } from "./info";

const e = (term: string, description: string, extra: Partial<InfoEntry> = {}): InfoEntry => ({ term, description, ...extra });

/** A market while it's open (10.8): someone not yet in and someone in, since both are the open market; the swaps for the other kinds. */
function marketOpen(kind: "binary" | "numeric" | "categorical"): InfoSheet {
  // The entry and the sheet exist until you're in and again from Change (3.24: once you're in, nothing is your move); on a blind market never again.
  const until = "until you’re in, or changing";
  const entry = kind === "numeric" ? e("Tap the number", "Type your number; − and + step it, and holding either repeats.", { qualifier: until }) : kind === "categorical" ? e("Tap an answer", "Picks it; tap another to move your pick.", { qualifier: until }) : e("Drag along the odds line", "Sets your odds from 0% to 100%; a tap anywhere on the line jumps there.", { qualifier: until });
  // Once in, with two in, the sheet holds the close instead (the games-and-the-reveal round), and the same gesture lowers it.
  const sheet = kind === "categorical" ? e("Swipe the sheet down", "Lowers it to a bar, so what’s behind it can be read; tap the bar to raise it.") : e("Swipe the sheet", "From its top row: up raises it to its move, down lowers it.");
  // A pick has no closer and no gap (3.25): the answer that happened scores in full and every other pick nothing.
  const settles = kind === "categorical" ? e("How it settles", "A wrong pick settles with each right pick; all right or all wrong, nothing changes hands.") : e("How it settles", "You settle only with people who land closer than you, and only by the gap between you.");
  return {
    name: "A market, while it’s open",
    groups: {
      Gestures: [e("Tap the avatars", "Opens who’s in: everyone in so far.", { qualifier: "once you’re in" }), sheet, entry],
      Icons: [
        e("More", "Beside this sheet’s icon: how this one works, and its colour to pick if you asked it.", { glyph: "more", qualifier: "once you’re in" }),
        e("Share", "Sends the question and its link to a chat; the preview shows who asks and when it closes.", { glyph: "share", qualifier: "once you’re in" }),
        e("Copy the link", "Copies it; the icon turns to a check for a moment.", { glyph: "copy", qualifier: "once you’re in" }),
        e("Show a code to scan", "A code a friend scans with their own phone to open this market.", { glyph: "code", qualifier: "once you’re in" }),
        e("Pass the phone", "A friend with an account gets in on your phone with their PIN.", { glyph: "pass", qualifier: "once you’re in" }),
      ],
      "Rules and timing": [
        e("Your entry", "Yours to change until the close, from Change on your entry line.", { qualifier: "once you’re in" }),
        e("Where everyone landed", "Shows once you’re in, never before; in a blind market yours is final then."),
        e("The close", "Its asker, enough of the people in, its time or a game’s start closes it."),
        e("Photos", "Add them from the bottom of the screen; everyone in it and its group sees them.", { qualifier: "once you’re in" }),
        settles,
      ],
      "Everything else": [
        e("Not you?", "Under the move that gets you in: signs this phone out so someone else can join.", { qualifier: "until you’re in" }),
        e("Remove, in who’s in", "Takes out an entry from someone without an account, until the close.", { qualifier: "if you asked it" }),
        e("Closing it early", "The asker closes it; anyone else says Calls are in, and enough of them close it.", { qualifier: "with two in" }),
      ],
    },
  };
}

/** A market once calls are in (3.24, the fifteenth session): closed, and waiting for it to happen. */
function marketCalls(): InfoSheet {
  return {
    name: "A market, calls are in",
    groups: {
      Gestures: [e("Tap the avatars", "Opens who’s in, by name.", { qualifier: "if you’re in it" })],
      Icons: [e("More", "What the stake is in, and for the asker its colour.", { glyph: "more" }), e("Share", "Sends the market’s link to a chat.", { glyph: "share", qualifier: "if you’re in it" }), e("Copy the link", "Copies it; the icon turns to a check for a moment.", { glyph: "copy", qualifier: "if you’re in it" })],
      "Rules and timing": [
        e("Calls are in", "Nobody gets in or changes now, and who said what shows to everyone in."),
        e("It’s happened", "Opens the vote for everyone at once; so do the final score and the date it’s decided."),
        e("The live score", "The score and where the game is, above who said what, while it’s being played.", { qualifier: "on a question from What’s on" }),
      ],
      "Everything else": [e("The numbers under it", "Each person’s exact number, or on a game the side they leaned to.")],
    },
  };
}

/** A market once it has closed: saying what happened, and calling it. */
function marketVoting(kind: "binary" | "numeric" | "categorical"): InfoSheet {
  const say = kind === "numeric" ? e("The number field", "In the sheet: type what it was or step it with − and +, and sending it is your vote.") : kind === "categorical" ? e("The answers", "Tap the one that happened; the sheet raises to say it, with a photo or a screenshot.") : e("The two answers", "Tap what happened; the sheet raises to say it, with a photo or a screenshot.");
  // The quiet button under Agree (3.24 as amended 2026-10-08).
  const dissent = kind === "numeric" ? e("I see it differently", "Takes the number you saw as your vote, a note instead, or nobody can tell.") : kind === "categorical" ? e("I see it differently", "Lists the other answers to pick from, and I couldn’t tell.") : e("I see it differently", "Picks the other way, or nobody can tell.");
  // A What's on question waits on its source (3.35): the score, or the play-by-play for the first drive, which is a pick-one question.
  const feed = kind === "categorical" ? e("The play-by-play", "Proposes how the drive ended once it’s in; Say it yourself shows two hours after.", { qualifier: "on a question from What’s on" }) : e("The final score", "Proposes what happened once it’s in; Say it yourself shows two hours after the game.", { qualifier: "on a question from What’s on" });
  const more = kind === "numeric" ? "What the stake is in, what the group’s number means, and for the asker its colour." : kind === "categorical" ? "When picks show and what the stake is in, and for the asker its colour." : "What the stake is in, the group’s number exactly, and for the asker its colour.";
  return {
    name: "A market, while it’s called",
    groups: {
      Gestures: [e("Tap the avatars", "Opens who’s in, and who still has to call it, each with a nudge beside them.", { qualifier: "if you’re in it" }), e("Swipe the sheet up", "Shows who said what, what anyone attached, and a row to attach your own.", { qualifier: "until you’ve voted" })],
      Icons: [e("More", more, { glyph: "more" }), e("Share", "Sends the market’s link to a chat.", { glyph: "share", qualifier: "if you’re in it" }), e("Copy the link", "Copies it; the icon turns to a check for a moment.", { glyph: "copy", qualifier: "if you’re in it" })],
      "Rules and timing": [
        e("Closed", "Nobody gets in or changes now; whoever saw it says what happened first."),
        feed,
        e("Calling it", "Your vote only ever comes from your own phone, and a majority settles it."),
        e("The read", "The app’s lean heads the sheet until you vote; the line under it says how many agree.", { qualifier: "once someone has said what happened" }),
        e("The tiebreaker", "After the deadline, hears both sides and calls it, as everyone agreed on entering.", { qualifier: "if the terms name one" }),
        e("Photos", "Everyone in it sees them; a clip on the claim stays on the claim."),
      ],
      "Everything else": [
        e("Nudge them", "Reaches whoever hasn’t called it yet, once per six hours.", { qualifier: "if you’re in it" }),
        say,
        dissent,
        e("Change, on your line", "Reopens your vote while it’s undecided."),
        e("Add what you saw", "Your case for the tiebreaker in a line, with a photo or a screenshot if you like.", { qualifier: "in a deadlock, once you’ve voted" }),
      ],
    },
  };
}

/** An argument after its close, while the app's ruling stands (3.24 as amended 2026-10-08, the touch-ups round). */
function marketRuling(): InfoSheet {
  return {
    name: "An argument, ruled",
    groups: {
      Icons: [e("More", "What the stake is in, and for the asker its colour.", { glyph: "more" }), e("Share", "Sends the argument’s link to a chat.", { glyph: "share", qualifier: "if you’re in it" }), e("Copy the link", "Copies it; the icon turns to a check for a moment.", { glyph: "copy", qualifier: "if you’re in it" })],
      "Rules and timing": [
        e("Ruled when it was asked", "The ruling was sealed then, and the terms everyone signed carry its seal.", { qualifier: "when facts settle it" }),
        e("Everyone agreeing", "Settles it at once; a tap, binding nobody who hasn’t."),
        e("A day of quiet", "With nobody seeing it differently a day after it shows, the ruling stands."),
        e("The tiebreaker", "Hears the ruling and what anyone says it got wrong, and its ruling settles it."),
      ],
      "Everything else": [
        e("Agree", "Says the ruling is right; once everyone in it has, it’s settled."),
        e("I see it differently", "Asks what it got wrong, with a photo if you like, for the tiebreaker."),
        e("Who sees it differently", "Everyone in it sees who disputed the ruling and why."),
        e("How to check it", "The salt and the words that hash to the seal in the terms you signed."),
        e("Say what happened", "What you saw, with a photo or a screenshot; the app rules from it.", { qualifier: "when what you saw settles it" }),
      ],
    },
  };
}

export const INFO_SHEETS: Record<string, InfoSheet> = {
  now: {
    name: "Now",
    groups: {
      Gestures: [
        e("Swipe down from the top", "Re-reads any screen but a sheet, asking or a full-screen photo; a line runs meanwhile."),
        e("Swipe left on a row", "A question you asked that nobody else is in: Remove; a finished one: Archive."),
        e("Tap a row you slid", "Slides it back without opening it; so does a swipe to the right."),
      ],
      Icons: [e("Ask something", "Opens the question step, rising over Now; the tab bar is just covered.", { glyph: "plus" }), e("Back, on other screens", "Lands on the tab you came from; inside asking, it goes one step back.", { glyph: "back" })],
      "Rules and timing": [
        e("Needs you", "Only what you can finish now, time-bound first; the yellow dot marks the soonest."),
        e("Running", "What you’ve acted on: your entry and how many are in, then where it stands once closed."),
        e("Just happened", "What the group did, the newest eight; a tap opens the question, the game or the person."),
        e("Coming back", "Any screen re-reads itself when you return to the app after two seconds away."),
        e("The turning ring", "A tap of yours still going through; Try again marks one that never landed."),
      ],
      "Everything else": [
        e("Got a code?", "Opens the code screen: six characters a friend read you join their question."),
        e("A row’s verb", "Enter, Vote, Close, Yep, Finish or Try again opens the thing at its move."),
        e("That’s me", "Takes what a friend logged under your name, then shows what was waiting."),
        e("A game’s row", "The row opens the game; its verb opens the question that needs you."),
        e("2 more, under Needs you", "Needs you shows four rows; this opens the rest."),
        e("The tab you’re on", "Tapped again, brings the screen back to the top."),
      ],
    },
  },
  "now-first-run": {
    name: "Now, before anything",
    groups: {
      Gestures: [e("Swipe down from the top", "Re-reads any screen but a sheet, asking or a full-screen photo.")],
      "Rules and timing": [e("Nothing yet", "Now fills once you ask something, or a friend brings you into something of theirs.")],
      "Everything else": [
        e("Ask something", "Opens the question step; once sent, your question shows here under Running."),
        e("The six boxes", "Type or paste a code a friend read you; Join opens their question."),
        e("Got a link?", "Opens the code screen, where Paste a link reads one off your clipboard."),
        e("A game row", "Opens the game to ask your friends something about it."),
        e("A question to start from", "Opens the question step with that question already typed.", { qualifier: "when no games are listed" }),
      ],
    },
  },
  "whats-on": {
    name: "What’s on",
    groups: {
      Icons: [e("Ask something", "Opens the question step, rising over What’s on; the tab bar is just covered.", { glyph: "plus" })],
      "Rules and timing": [
        e("Most asked", "Shows once ten groups of friends are on a game; below that, the schedule alone."),
        e("What a row says", "How much a game is used, and your own use; never what anyone thinks."),
        e("New games", "Arrive on their own a few days ahead; nothing here badges the tab."),
        e("When a game starts", "It leaves this list, since everything on it closed at kickoff."),
      ],
      "Everything else": [e("A game row", "Opens the game with your friends’ questions on it, or the start of one with them."), e("Try again", "Reads the schedule again when the latest games couldn’t be fetched.", { qualifier: "if the games didn’t load" })],
    },
  },
  people: {
    name: "People",
    groups: {
      Icons: [e("Ask something", "Opens the question step, rising over People; the tab bar is just covered.", { glyph: "plus" })],
      "Rules and timing": [
        e("Who gets a row", "Anyone with something open with you, and anyone not here yet; the square share one line."),
        e("What a row shows", "One thing still open between you, counts before dollars; their page has the rest."),
        e("Not here yet", "Someone with no account yet who joined a question of yours, in grey with a dashed ring."),
      ],
      "Everything else": [e("The square row", "Opens to list everyone who’s square with you, each opening their page."), e("A person", "Opens what’s between you two, and the move to log a cover.")],
    },
  },
  you: {
    name: "You",
    groups: {
      Icons: [e("Ask something", "Opens the question step, rising over You; the tab bar is just covered.", { glyph: "plus" })],
      "Rules and timing": [
        e("How your calls land", "Draws from ten resolved yes-or-no calls; under ten it lists them."),
        e("Numbers", "Draws from five resolved number questions, and never shows one question’s distance."),
        e("Questions you asked", "A void by the group or the tiebreaker counts against the asker; an expiry against nobody."),
        e("What this never is", "No score, grade or rank, and nobody else sees any of it."),
        e("Your PIN", "Five wrong tries in a row lock it for an hour, and you hear whose phone it was on."),
      ],
      "Everything else": [
        e("Your units and marks", "Read-only lists: units from questions and covers with their yep, marks from questions."),
        e("Appearance", "Match your phone, always dark, or always light; kept on this phone only."),
        e("Pass the phone", "Lets you get into a market from a friend’s phone with a PIN; off wipes it.", { qualifier: "on only from the phone you signed in on" }),
        e("Sign out", "Asks once; everything stays where it is."),
      ],
    },
  },
  "market-draft": {
    name: "A question, not sent yet",
    groups: {
      Gestures: [e("Drag, type or tap", "The line, the number or an answer is yours to set; the first touch shows your stake."), e("Swipe the sheet", "From its top row: up shows your stake and the move that gets you in; down lowers it.")],
      Icons: [e("More", "How answers will show, what the stake is in, and the colour behind the mark to pick.", { glyph: "more" })],
      "Rules and timing": [e("Not sent yet", "Nobody sees it until you send it; the dashed line around the question says so.")],
      "Everything else": [e("I’m in, at the bottom", "Gets you in and sends it to everyone you picked, at once.")],
    },
  },
  "market-open": marketOpen("binary"),
  "market-open-number": marketOpen("numeric"),
  "market-open-pick": marketOpen("categorical"),
  "market-calls": marketCalls(),
  "market-ruling": marketRuling(),
  "market-voting": marketVoting("binary"),
  "market-voting-number": marketVoting("numeric"),
  "market-voting-pick": marketVoting("categorical"),
  "market-ended": {
    name: "A market, once it’s over",
    groups: {
      Gestures: [
        e("Tap the large photo", "Opens it full screen, with the rest to swipe through."),
        e("Tap a small photo", "Brings it into the large one above; the +N square shows the rest."),
        e("Tap the avatars", "Opens who’s in: everyone who was in, and who asked it.", { qualifier: "if it settled" }),
      ],
      Icons: [
        e("More", "How it works, what each person said happened, and what the others attached.", { glyph: "more" }),
        e("Share", "Sends how it ended to a chat, with the result as its picture.", { glyph: "share", qualifier: "if it settled" }),
        e("Copy the link", "Copies it; the icon turns to a check for a moment.", { glyph: "copy", qualifier: "if it settled" }),
      ],
      "Rules and timing": [
        e("Closest first", "Everyone ranked by how close they were; ties share a rank.", { qualifier: "on a yes-or-no or number question" }),
        e("Everyone’s pick", "Every answer with who picked it; the one that happened is filled in, and nobody is ranked.", { qualifier: "on a pick-one question" }),
        e("Who’s got who", "What changed hands, each outlined in its person’s colour; nobody won or lost by name."),
        e("Void or never settled", "Nothing changes hands; a void the group or the tiebreaker called counts against its asker."),
        e("Settled by the tiebreaker", "The ruling is on the screen word for word, under the details.", { qualifier: "if the tiebreaker called it" }),
      ],
      "Everything else": [
        e("The plus after the photos", "Adds a photo from the night, weeks later included; with none, Add the first photo.", { qualifier: "if you were in" }),
        e("Part of, under the question", "Opens the game this question came from, with its other questions.", { qualifier: "on a What’s on question" }),
        e("Settled and Call it even", "Not here: they’re on the person’s page, on the story this question left there."),
      ],
    },
  },
  "market-memory": {
    name: "A memory",
    groups: {
      Gestures: [
        e("Tap the large photo", "Opens it full screen, with the rest to swipe through."),
        e("Tap a small photo", "Brings it into the large one above; the +N square shows the rest."),
        e("Tap the avatars", "Opens who’s in: everyone who was in, and who asked it.", { qualifier: "if it settled" }),
        e("Tap a row below", "Under The rest of that night, or day, opens that question or cover."),
      ],
      Icons: [e("More", "How it works, what each person said happened, and what the others attached.", { glyph: "more" }), e("Share", "Sends how it ended to a chat.", { glyph: "share", qualifier: "if it settled" })],
      "Rules and timing": [
        e("The date above the question", "From the second day on, this is the memory it left, photos first."),
        e("What it left", "The card after the avatars: what changed hands, grouped by who has got who.", { qualifier: "if it settled" }),
        e("The rest of that night", "At most five other things within six hours, shared by you and someone else who was in."),
      ],
      "Everything else": [e("The plus after the photos", "Adds a photo from that night, any time; with none, Add the first photo.", { qualifier: "if you were in" })],
    },
  },
  "market-link": {
    name: "A question, from a link",
    groups: {
      Gestures: [e("Swipe the sheet", "Up raises it to its move; down lowers it to read the question.")],
      Icons: [e("Share", "Sends the question and its link to a chat; the preview shows who asks and when it closes.", { glyph: "share", qualifier: "once you’re in" }), e("Copy the link", "Copies it; the icon turns to a check for a moment.", { glyph: "copy", qualifier: "once you’re in" })],
      "Rules and timing": [
        e("No account needed", "A name is enough to get in.", { qualifier: "while it’s open" }),
        e("One entry a phone", "This phone holds one entry on a question, and ten people without accounts fit in one."),
        e("Blind", "Your answer is final once made, and then you see everyone’s.", { qualifier: "in a blind market" }),
        e("Your entry", "Yours to change on this phone until the close, from Change on your entry line.", { qualifier: "once you’re in" }),
        e("Where everyone landed", "Shows once you’re in, never before."),
        e("Closed or finished", "Nobody gets in after the close; the sheet says so, and you can still look."),
      ],
      "Everything else": [
        e("Who’s joining?", "The step after your number: your name, saved exactly as Join as says it."),
        e("I already have an account", "Under Join as: signs you in before anything is sent, so you get in as yourself."),
        e("Not you?", "This phone forgets who it joined as before, asking once; then you join as yourself.", { qualifier: "if it remembers you" }),
        e("Keep your calls", "After your entry: Google, an email or a phone number keeps it in an account.", { qualifier: "once you’re in" }),
      ],
    },
  },
  person: {
    name: "A person",
    groups: {
      Gestures: [e("Tap a story", "Opens the question it came from, or the game when it holds several questions."), e("Swipe the sheet", "Up opens I got this one to fill in; down lowers it to read the page.")],
      "Rules and timing": [
        e("The header", "What’s open and expected back, each unit as the difference between you; never a zero."),
        e("Coming up", "What’s still ahead between you two; the past folds past twelve behind Show earlier."),
        e("Who picked up last", "The last twelve pick-ups nobody expects to settle, in order, never a count."),
      ],
      "Everything else": [
        e("Cancel out, under the header", "The same unit both ways cancels by the smaller side, from either of you."),
        e("Where you two turn up", "Tap a name to see only what came out of those people; Clear shows it all again."),
        e("A cover of yours", "Opens Add a photo of it, then Settled and Call it even, either closing all of it.", { qualifier: "while it’s open" }),
        e("What a question left you", "A row under a story that’s yours to close opens Settled and Call it even."),
        e("I got this one", "From the bottom: what, how many, who picks up next, a note, and a cost nobody else sees."),
        e("Nobody’s paying it back", "Keeps it out of the header; it shows in the dots of who picked up last."),
      ],
    },
  },
  "person-ghost": {
    name: "Someone not here yet",
    groups: {
      Gestures: [e("Swipe the sheet", "Up opens I got this one to fill in; down lowers it to read the page.")],
      "Rules and timing": [e("Not here yet", "What you log waits under this name until they sign in and say it’s right."), e("Fine, you got me", "Shows under a cover once they’ve answered from your link, before signing in.")],
      "Everything else": [
        e("Make a link for them", "A link that shows them what’s waiting and lets them keep it."),
        e("Send the link, and Copy", "The link shows once, and goes out from your own messages, never from the app."),
        e("Someone I already have", "Merges what’s here into a person you know."),
        e("Let them go", "Closes what’s waiting and ends their link; the number they gave is forgotten."),
        e("I got this one", "At the bottom: logs a cover under this name, which waits until they’re here."),
      ],
    },
  },
  game: {
    name: "A game",
    groups: {
      Icons: [
        e("More", "Every question’s terms, as they’ll be read.", { glyph: "more" }),
        e("Share", "Sends the game and its link to a chat; the preview shows who started it and the questions.", { glyph: "share", qualifier: "until the final" }),
        e("Copy the link", "Copies it; the icon turns to a check for a moment.", { glyph: "copy", qualifier: "until the final" }),
      ],
      "Rules and timing": [
        e("Kickoff", "A question asked before the start closes at it; one asked during, after its first call."),
        e("No number until you’re in", "Until you’re in, a card shows the close and how many are in, never anyone’s number.", { qualifier: "while it’s open" }),
        e("The line on a card", "A dot marks your answer and a tick the group’s number, from three in.", { qualifier: "once you’re in" }),
        e("The yellow dot", "Marks the first question still open that you’re not in.", { qualifier: "until kickoff" }),
        e("Anyone can add", "Anyone on the page can add a question until the final, not only whoever started it."),
        e("The final score", "Settles what the votes haven’t, a day after the game, or three with only one result."),
        e("The first drive", "The play-by-play settles it if the votes haven’t, three days on.", { qualifier: "if it’s among the questions" }),
      ],
      "Everything else": [e("The names on a card", "Who asked it and with whom, when you’re on this game with two or more groups.", { qualifier: "with two or more groups" }), e("A question card", "Opens it here and closes the one open; its sheet is the page’s."), e("Add another", "One more question from the menu, until the final; one already here is offered first.")],
    },
  },
  "game-link": {
    name: "A game, from a link",
    groups: {
      "Rules and timing": [e("No account needed", "Each question opens here, in its card, where a name is enough to get in.", { qualifier: "until it closes" }), e("Signed in", "Each question opens here too; joining puts you in with whoever is in it.")],
      "Everything else": [e("A question card", "Opens it here and closes the one open; you get in there until it closes.")],
    },
  },
  "game-night": {
    name: "The night of a game",
    groups: {
      Gestures: [e("Tap the large photo", "Opens it full screen, with the rest to swipe through; a small one shows large first."), e("Tap a row below", "Under The rest of that night, or day, opens that question or cover.")],
      "Rules and timing": [e("The final score", "Titles the night once it’s in; who’s got who adds every question together.")],
      "Everything else": [
        e("A question card", "Opens it here, with how it ended."),
        e("The plus after the photos", "Adds photos from the night; with none, Add the first photo.", { qualifier: "if you were in" }),
      ],
    },
  },
  "game-start": {
    name: "Starting a game",
    groups: {
      "Rules and timing": [
        e("Who wins", "Ticked when the page opens; tick the rest of the menu as you like.", { qualifier: "when starting a game" }),
        e("Stakes", "One kind of thing for every question you tick, fixed once you send it."),
        e("The line above Send it", "Says what settles each question if nobody votes; getting in accepts it."),
        e("The terms", "Written for you and fixed, so everyone reads the same words."),
      ],
      "Everything else": [
        e("Set the terms", "Waits until a question is ticked; then read the terms."),
        e("Back", "On the terms, returns to the menu; the ticks are kept.", { qualifier: "when starting a game" }),
        e("Send it", "Opens every ticked question at once, each closing as its terms say."),
      ],
    },
  },
  claimant: {
    name: "What was waiting for you",
    groups: {
      "Rules and timing": [
        e("Covers logged against you", "Start unpressed: you confirm each one with a deliberate yep."),
        e("A cover left unpressed", "Waits under Needs you on Now, where you can say yep or not this one later."),
        e("Entries from a link", "Start pressed, since you made them; unpressed, they stay under the typed name."),
        e("Twelve at a time", "One Yep confirms twelve covers at most; the rest are still here after."),
      ],
      "Everything else": [e("The checks", "Pick what’s right; the Yep at the bottom counts what you picked and confirms it together.")],
    },
  },
  code: {
    name: "Got a code?",
    groups: {
      "Rules and timing": [
        e("A code", "Six characters, no O, I, Z, zero or one; one per question, dead once it closes."),
        e("Wrong codes", "Twenty an hour, then it asks you to wait or to get the link."),
        e("What joining does", "A code or a link adds you to the people it was asked of, before you enter anything."),
      ],
      "Everything else": [e("Paste a link", "Reads a market link off your clipboard and opens it; a field takes one if it can’t."), e("Join", "In the sheet at the bottom; it waits for all six characters.")],
    },
  },
  "claim-landing": {
    name: "Someone added you",
    groups: {
      "Rules and timing": [e("A link never signs in", "It’s the sender’s claim about who you are; keeping it is your say.")],
      "Everything else": [
        e("That’s me", "Signed out, this phone remembers you; signed in, these become yours to answer."),
        e("Fine, you got me", "Says so to the sender without an account; it counts for nothing until you sign in.", { qualifier: "after That’s me" }),
        e("Sign in", "Signs in with a number or an email; what’s here follows you.", { qualifier: "after That’s me" }),
        e("I already have an account", "Signs you in first; That’s me then makes these yours to answer.", { qualifier: "signed out" }),
      ],
    },
  },
  cover: {
    name: "A cover",
    groups: {
      "Rules and timing": [
        e("Nothing until the yep", "Nothing is on the record until the person it was logged for says yep."),
        e("Waiting for them", "Only the person it was logged for can answer; you can’t take it back here.", { qualifier: "if you logged it" }),
        e("Didn’t go through", "Your last yep never landed; Yep, that’s right sends it again.", { qualifier: "after a yep that missed" }),
      ],
      "Everything else": [
        e("Yep, that’s right", "Confirms it and opens their page, where it now sits between you two.", { qualifier: "if it was logged for you" }),
        e("Not this one", "Leaves it out for good, with no second ask; it goes from both pages and nobody is told.", { qualifier: "if it was logged for you" }),
      ],
    },
  },
  "cover-link": {
    name: "A cover, from a link",
    groups: {
      "Rules and timing": [e("Sign in to see it", "Only the two people in it can open it; nothing counts until you say so."), e("What the link shows", "Only the first name of whoever covered; never what, how much, or who it’s for.")],
      "Everything else": [e("Sign in", "A number or an email, then a code; someone new is asked a first name too.")],
    },
  },
  "ask-question": {
    name: "Asking",
    groups: {
      Gestures: [
        e("Hold a mark", "In the picker, half a second on a mark with skin tones opens them."),
        e("Tap a category", "In the picker, a category’s name takes you to its marks."),
        e("Tap a person", "Under Add a person, adds them as an answer; one already added is dimmed.", { qualifier: "on Pick one" }),
      ],
      Icons: [e("Close", "Closes asking and returns you exactly where you were.", { glyph: "down" }), e("The cross on an answer", "Takes that answer out; two answers always stay.", { glyph: "close", qualifier: "on Pick one" })],
      "Rules and timing": [
        e("Quick setup", "One line in, terms out; they start being written while you finish typing."),
        e("Help define the terms", "Three quick questions before the terms, for when a lot rides on it."),
        e("A named subject", "A name the app can’t place asks what it is, in one tap, before the three."),
      ],
      "Everything else": [
        e("Got a code?", "Opens the code screen to join a friend’s question instead."),
        e("Add a mark", "Opens the picker; a mark with a colour of its own gives the question that colour."),
        e("Settle an argument", "Between two of you; when facts settle it, the app rules as it’s asked, sealed."),
        e("Pick a number", "The terms step then asks what the number counts and how far off scores nothing."),
        e("Pick one", "Two to six answers, a few words each or a person you know here."),
        e("Set the terms", "Writes the terms for your question; they arrive as they’re written."),
        e("Ask me", "Asks the three questions first; the terms are written once you’ve answered them.", { qualifier: "with Help define the terms" }),
        e("Check it.", "Says whether facts can settle it; an argument about someone in the group isn’t ruled on.", { qualifier: "on Settle an argument" }),
      ],
    },
  },
  "ask-terms": {
    name: "The terms",
    groups: {
      Icons: [e("Back", "Returns to the question; the writing carries on.", { glyph: "back" })],
      "Rules and timing": [
        e("Writing the terms…", "Shows until the first words, which often start while you’re still typing."),
        e("Everyone reads these", "Exactly these words, before they’re in; being in accepts what If it’s unclear says."),
        e("Scored on", "How far off scores nothing; left blank where offered, the app’s own is never shown.", { qualifier: "on a number question" }),
      ],
      "Everything else": [
        e("Your question, above", "A field once written, like Counts if; Edit beside it goes to the question step."),
        e("Counts if", "Editable once written, and not before."),
        e("What the number counts", "The app proposes one and many with the terms; both are yours to change.", { qualifier: "on a number question" }),
        e("Your side", "All the way by default; your number can be softened on the question’s own screen.", { qualifier: "on an argument" }),
        e("Decided", "Tonight is the end of today; This week and This month count from now, or pick a date."),
        e("Stakes", "The kind alone; how much is set at entry, and a group you’ve asked brings its own units."),
        e("Where everyone landed", "Hidden makes each answer final once made; you still see everyone’s once you’re in."),
        e("If it’s unclear", "A tiebreaker rules after the deadline, or it goes unsettled and nothing changes hands."),
        e("Send it", "Opens the question and shows its screen, with share, copy and the code to send it."),
        e("A game it names", "Offered once: Let the final score settle it ties your question to that game.", { qualifier: "when it names a game" }),
        e("Try again", "Writes the terms again from the start.", { qualifier: "if the writing stops" }),
      ],
    },
  },
  "ask-careful": {
    // One key for four states of the ask flow (ask-form.tsx: the named subject, the three questions, a refusal and the pick of what a claim means), so the entries for the last three carry their state.
    name: "Three quick ones",
    groups: {
      Icons: [e("Back", "Returns to the question, with everything kept.", { glyph: "back" })],
      "Rules and timing": [
        e("Only you see these", "The three answers shape the terms; nobody else reads them."),
        e("What the app won’t call", "Anything about one of you, or a matter of taste; it never says who’s right.", { qualifier: "if it declined" }),
        e("The way you pick", "Is written into the terms, so being in accepts it and the tiebreaker rules by it.", { qualifier: "on the pick of what it means" }),
      ],
      "Everything else": [
        e("What the name is", "Tap a person, a pet or something else; the three questions are written for it.", { qualifier: "if a name was asked about" }),
        e("Change, on the subject line", "Reopens what the name is: a person, a pet, or something else.", { qualifier: "once you’ve said what it is" }),
        e("Set the terms", "Works once all three are answered, and starts the terms being written."),
        e("Make it a dare instead", "Puts the suggested line in as a question about something that’ll happen.", { qualifier: "if it declined" }),
        e("Say it another way", "Returns to what you typed, to put it as a claim about the world.", { qualifier: "after a decline, or on the pick" }),
      ],
    },
  },
  photo: {
    name: "A photo",
    groups: {
      Gestures: [e("Swipe sideways", "Moves through the photos in the order the screen you came from shows them."), e("Hold a photo", "The phone’s own Copy Subject lifts a cutout, to paste under Your stickers when you ask.", { qualifier: "on an iPhone" })],
      Icons: [e("Close", "Returns to the screen the photo was opened from.", { glyph: "close" })],
      "Everything else": [
        e("Make a sticker", "Tap what to keep, then Keep it; it lands in Your stickers for the next thing you ask."),
        e("Paste, in Make a sticker", "Takes a cutout you copied; offered while the cutter loads, or where it can’t.", { qualifier: "on an iPhone" }),
        e("Ask something with it", "After a sticker is made, opens a new question with it as the mark."),
        e("Save", "Saves it to your phone through the share sheet."),
        e("Remove", "Asks once, then takes it off for good; what you attached to a call stays.", { qualifier: "your own" }),
      ],
    },
  },
};

export function infoSheet(key: string): InfoSheet | null {
  return INFO_SHEETS[key] ?? null;
}
