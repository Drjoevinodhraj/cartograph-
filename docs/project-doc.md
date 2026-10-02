Cartograph
A local app that reads a public GitHub repo and
draws it as a dependency map.
Everything on screen comes from really parsing
the code. The AI explains what
the parser found, it never decides what's there.
Why any of these rules exist is in docs/project-
doc.md. This file is the
rules themselves.
Stack
Next.js 16 App Router, React 19, TypeScript
strict. ts-morph for parsing. React
Flow and dagre for the map. Clerk for sign-in and
organizations. Supabase for
Postgres, row-level security and realtime. The
OpenAI SDK through one wrapped
client, traced with LangSmith. Tailwind v4. pnpm.
Next.js 16 changed a lot. If you're not certain
about an API, read the docs
inside the installed package rather than going
from memory.
How we work
Spec driven. Nothing gets built without a spec.
docs/project-doc.md — what this app is and
every decision behind it. Read
the part you need. Don't ask me to paste it.
docs/specs/phase-NN.md — one per phase,
written just before it starts.
Behaviour and an acceptance check, never
filenames.
This file — always true, read on every prompt.
Starting a phase. Read this file and that phase's
spec. Build what the spec
asks and stop.
Dropped into a fresh context and don't know
where we are? Look at which
files exist in docs/specs/, then the git log. The
last commit is the last
phase that passed. Tell me what you've worked
out before building on it.
The acceptance check is mine to run, not yours.
list of things I do
by hand in a browser. Don't automate it, don't
install a test runner or browser
driver for it. Build so those things are true, then
tell me it's ready.
What you check before saying a phase is done:
types, lint, build. Anything
verifiable from a terminal in a few seconds is
yours — running a script and
reading its output counts. Anything needing a
browser is mine.
When a phase comes out wrong, I reset rather
than patch. Prompting on top of
wrong code three times leaves code nobody
understands, including you. So if a
spec is ambiguous, say so before you build.
How to talk to me
Short. If a sentence isn't telling me something I
need, cut it.
Ask with an answer attached. One specific
question, and say which way you'd
go and why. "A or B, I'd take B because it keeps
the parser standalone" is
answerable in two seconds. An open question
isn't. Never pick a direction
silently, never build both.
When you need something only I can give you —
a key, a token, a value in
.env.local — say exactly what and exactly where,
then stop.
No walls of text. Don't summarise every file you
touched or restate the plan
back to me. When a phase is done, say what it
does and what the check should
show, in a few lines.
Plain English. If you're reaching for a bulleted
breakdown of something
that's one sentence, it's one sentence.
Say when something didn't work. A failure
worked around quietly costs me an
hour later.
How the code is laid out
You pick the file structure. These are about
behaviour.
The parsing code can't import Next, React or
the database client. Path in,
data out, runnable from a plain script.
No framework checks inside the parser. That
knowledge lives in an adapter.
Graph calculations are pure functions over a
file list and an edge list.
Database access happens in server code,
not inside components.
Who may read a row is decided by a policy,
never by application code. If a
query needs a where clause to return the right
rows, the policy is wrong.
One place constructs the AI client. Anywhere
else silently skips tracing.
Conventions
Strict TypeScript, no any. If a type is genuinely
awkward, tell me rather than
casting.
Comment the decisions, not the syntax.
Every AI call has a cache read inside its trace, so
a cache hit shows up as a
recorded run with no model call in it.
One obvious way to do something beats a
configurable one.
The UI is a dense developer tool. Small type,
tight spacing, monospace for file
paths. Colour means something or isn't there.
Nothing moves unless it was
clicked.
There's a frontend design skill that activates on
own for UI work. Use it,
but the paragraph above overrules it — it will
reach for motion, depth and big
type, and this is a tool someone stares at for an
hour.
Things not to do
Breaking one of these is worse than not finishing.
Never decide that two files are connected.
An edge exists because the
parser resolved a real import to a real file.
Unresolved gets reported with a
reason, never guessed.
Never invent something to fill a gap. Skipped
file? Say so and count it.
beats approximate.
Don't install a package without asking. Name
it, say what for, wait.
Don't build ahead of the current phase. No
scaffolding for what's coming.
Don't grade the code. No scores, ratings,
severity or "issues found". This
explains a codebase, it doesn't review one.
Don't leave the build broken. Tell me about a
failure instead of working
around it.
Don't weaken a check to make it pass. A
check that can't run has to fail
loudly.
Don't read from the database on a loop.
Name your columns, limit list
reads, subscribe instead of polling.
New.
Cartograph
The product decisions behind this build, written
before it starts, with the reasoning attached. The
reasoning matters more than the decision —
you'll hit forks this doesn't cover, and you'll need
to know which way the thinking was leaning.
Read the part you need before you build
something. Don't read it all at once, and don't
paste it into a prompt.
What it is
Sign in with GitHub, paste a public TypeScript or
JavaScript repository URL, and get a map of it.
Folders as boxes, imports as lines between
them. Open a folder into its files. Select a file
and see what it imports, what imports it, and
what
breaks two levels out if it changes. Ask for an
explanation and get a paragraph
written from that file and its real neighbours.
Then a panel where you can ask the repository a
question and watch it look the
answer up.
The problem
Codebases now routinely contain code nobody
on the team has read. An agent wrote
reasonable way to work and
it is not going to stop — but it accumulates
structure nobody chose. Files that
import through three layers of re-exports. A
utility forty files depend on. A
module nothing has referenced in months.
The questions that follow are structural. What is
this file, what depends on it,
what breaks if it changes. Answering them today
means reading imports one file at
a time and holding the results in working
memory, which stops working at around
thirty files and stops being attempted at all
somewhere past a hundred.
Who it's for
A developer opening a codebase they didn't
write — most often one they built
themselves with an agent, across many
sessions, and can no longer hold in their
head.
They can read code fine. What they can't see is
its shape.
And increasingly that isn't one person's problem.
A team of four all shipping
this way inherits four sets of code nobody read,
and the person who joins next
inherits all of it at once. So an analysis belongs
to an organization rather
than to whoever happened to run it. A repository
is mapped once and everyone
after that starts from the map.
This description is the test every feature gets
measured against. When something
tempting comes up — a quality score, a rating, a
review panel — the question is
whether the person described above wants it.
Usually they don't. They want to
know what depends on this file.
Why this hasn't stuck before
Codebase visualisation is not a new idea and the
track record is bad. CodeSee
built close to this with real funding behind it and
is gone. Sourcetrail ran for
years as a desktop tool and was archived. Any
plan here has to account for that
rather than assume it away.
The most likely explanation: both were selling a
of a codebase the user had
already read. A map you could have drawn
yourself is a nice-to-have, and
nice-to-haves lose. What changed is that people
now ship code they have never
read, which turns the same artifact into
something needed on a specific
afternoon for a specific reason.
The current generation of AI tools mostly work
the other way round — hand the
repository to a model and let it describe the
structure. That is much faster to
build, which is why there are many of them, and
it is the approach this product
is deliberately not taking. The next section is
why.
That's the bet. It is a bet, and it should be stated
as one.
The rule everything rests on
Every box and every line comes from really
parsing the code.
The AI may explain and label. It may never
decide that two files are connected,
and it may never walk the graph when arithmetic
can do it instead.
The reason, bluntly: a dependency graph that is
ninety percent right is worse
than no graph, because there's no way to tell
which ten percent is wrong. The
moment a model is allowed to guess at an edge,
every edge becomes a maybe, and
the product is a nice-looking picture.
Pressure to break this will come from two
"AI code analysis" pulls
toward letting the model reason about structure.
Anything calling itself a code
tool drifts toward becoming a code reviewer.
Both are refused.
Scope
Sign-in with GitHub, Google or email, for
identity only. No repo scope, no
token storage, public repositories only.
Organizations. Every analysis belongs to
one, people are invited into one, and
what you can see follows from which one
you're in. Default roles only.
Parsing every file — imports, re-exports and
dynamic imports become edges.
require() as well, because a large amount of
real code still uses it.
A pluggable place for framework knowledge,
so knowing what a Next.js route
looks like never leaks into the parser itself.
Fan-in and fan-out per file.
The map: folders folding into boxes,
expanding into files, selection,
highlighting, and a detail panel.
Blast radius and dependency chain, as
arithmetic over the edge list.
Explaining a file, with a cache that isn't
optional.
Labelling files that convention couldn't
identify.
Coverage reporting — how much of the
repository was parsed, and why the rest
wasn't.
instant.
A chat panel answered by an agent that
looks facts up rather than recalling
them.
A check on whether the AI ever names a file
that doesn't exist.
Out of scope, and why
Each of these is something a model will
propose, because each of them sounds
like an improvement. The reason matters more
than the refusal.
Scores, grades, severity badges, "three
issues found". This product
explains a codebase; it does not review one.
Once there's a number, people
argue with the number instead of reading the
map.
Letting the agent traverse the graph itself. It
picks a starting point and
a direction; the same arithmetic that draws
the canvas does the walk. If the
model does the walking, invented structure
comes straight back in.
Private repositories. Requires a token that
would then have to be stored.
Not in v1.
Approximate routes. If a route's method and
full path can't both be
recovered from the syntax, show nothing. A
wrong route is the same failure as
an invented edge.
Queues, containers, workers. One deployable
application. If a repository
is too large to parse in a request, that is a limit
to state honestly, not an
architecture to build around.
Languages beyond TypeScript and
JavaScript. Not because it's hard, but
because getting one language genuinely right
is the entire proposition.
How it works
No folder names here — the structure is yours to
choose. These are constraints
on behaviour.
The parser is standalone. It takes a directory
framework exists, does not know
the database exists, and must run from a plain
script with nothing else running.
If it can't run standalone, the layering is wrong.
Framework knowledge is an adapter, not a
branch. Knowing that a file in a
particular position is a page is Next.js
knowledge and belongs in an adapter. An
if (framework === ...) inside parsing code means
the interface built to prevent
exactly that has failed.
Graph calculations are pure functions over a list
of files and a list of
edges. No data fetching inside them, nothing to
mock in order to check them.
Identity is a token, and the token carries the
organization. Sign-in and
teams come from Clerk. Everything after that
decides what someone may see by
reading the organization claim off that token.
Nothing in the application asks
the identity provider a question at runtime.
The database is Postgres on Supabase, and
access to it is a policy rather
than a check the application remembers to
perform. Rows belong to an
organization, the policy reads the organization
off the token, and that is the
whole authorization layer. The distinction
matters: signing in from a different
organization should show the first one's rows
are not hidden by the interface
but absent from the query.
Row-level security is on by default, not per table.
An agent is writing
these migrations, and the two failure modes are
not symmetrical. A table with
security enabled and no policy yet returns
nothing, which is visible. A table
where someone forgot to enable it returns
everything, silently. The second one
must be impossible rather than unlikely.
Every AI call is traced and cached, with the
cache read inside the traced
function, so a cache hit appears as a recorded
run containing no model call.
That's what makes the cache verifiable rather
than assumed.
The interface
A dense developer tool, not a dashboard. Small
tight spacing, monospace for
anything that is a file path. Someone using this
is scanning a lot of names at
once, and the layout should assume that rather
than fighting it.
Colour carries meaning or it isn't there. Two
things earn colour. Direction:
what flows into a file and what flows out of it are
different colours,
because that distinction is the entire reason to
look at an edge. And kind: a
file gets a colour for what sort of thing it is, with
enough hues to separate a
handful of categories and no more. Everything
else — surfaces, borders, body
text — is greyscale.
The palette starts at four decisions. One blue as
the accent, for selection
and anything interactive. Green for incoming,
amber for outgoing. Surfaces near
white in light mode, near black in dark.
Everything else derives from those —
pick sensible values, keep them consistent, and
don't ask about each one.
Dark and light, and the user's choice wins. Three
states: follow the system,
force light, force dark. The choice survives a
reload. Both palettes are real
palettes rather than one of them inverted.
Nothing moves on its own. Motion happens
because something was clicked. No
ambient animation, no pulsing, no drifting graph.
Anything derivable from the edge list is instant.
If an answer is arithmetic
over data the browser already holds, it appears
immediately — no spinner, no
network request. Putting a spinner in front of a
calculation teaches people to
distrust the fast paths, which are most of them.
The shell gets built once. Where the panels sit,
and what each one is for, is
settled in an early phase. Later phases add to
those panels; they don't rearrange
them. Specific placement lives in the phase
specs.
Where this is likely to go wrong
Folding folders into readable boxes. A large
repository has to collapse into
something legible, and the threshold has to be
solved for rather than guessed.
one.
Import resolution. Path aliases, index files, re-
exports. The risk isn't
failure — it's silent failure. A repository built on
barrel files loses most of
its edges and still renders a clean, confident,
wrong picture. This is the one
place loud reporting wins over a tidy interface.
Measuring whether the AI output is any good.
Reading a few outputs and
judging them fine is not measurement. The
requirement is that answer quality
becomes a number; the method for producing
that number is genuinely open at the
time of writing, and it is the least settled part of
this plan.
What has to be true before this ships
Not "it looks right". Specifics:
Pointed at a known repository, five files
checked by hand match what the
parser claims they import.
Coverage states what was skipped and why,
and the number is believable.
Signed in from a different organization, the
first organization's rows do not
come back from the query at all.
Every table in the schema has row-level
security enabled. Not most of them.
An explanation never names a file absent
from the repository, and that is
demonstrated by a check rather than asserted.
The chat panel shows what it looked up
before it answers. An answer arriving
with no lookups behind it is the exact failure
this product exists to prevent.
