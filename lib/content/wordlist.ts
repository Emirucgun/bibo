// A1 / A2 kelime listeleri ve kapsama ölçümü (docs/SPEC.md 5.3 "kelime düzeyi").
// TASLAK: sık kullanılan İngilizce kelimelerden derlendi; pedagoji sahibi NGSL (CC BY-SA 4.0) ya da
// CEFR-J listesiyle değiştirecek. Kapsama = bilinen sözcük / tüm sözcük; özel adlar ve sayılar sayılmaz.
// Hedef: A1 ≥ %98, A2 ≥ %95 (Laufer & Ravenhorst-Kalovski 2010; app_settings `curriculum.coverage`).

const A1_WORDS = `
a an the and or but because so if when than then also too very not no yes all some any many much more most
i you he she it we they me him her us them my your his its our their mine yours this that these those here there
what who where when why how which whose
be am is are was were been being have has had do does did can could will would should must may might shall
go come get make take give see look watch hear listen say tell talk speak ask answer know think want like love
hate need help work play study learn read write live eat drink cook sleep wake run walk swim drive ride fly sit
stand open close start stop finish begin buy sell pay cost find lose win wear wash clean meet visit call send
use try put stay leave arrive travel move carry bring show teach understand remember forget feel smile laugh
cry sing dance draw paint jump climb catch throw kick hit fall turn wait hope wish choose change grow
day week month year today tomorrow yesterday morning afternoon evening night time hour minute second
monday tuesday wednesday thursday friday saturday sunday weekend
january february march april may june july august september october november december
spring summer autumn winter season
man woman boy girl child children baby people person friend family mother father mum dad parent brother sister
son daughter grandmother grandfather grandma grandpa aunt uncle cousin wife husband teacher student doctor
nurse driver cook farmer police officer worker player singer actor artist engineer pilot waiter shop
home house room kitchen bathroom bedroom garden door window wall floor table chair bed sofa desk lamp
school class lesson book pen pencil paper bag phone computer laptop screen tablet email message picture photo
city town village street road park shop market supermarket bank hospital station airport hotel restaurant cafe
museum cinema library office bus car train plane bike taxi ticket map
food water milk tea coffee juice bread rice pasta pizza egg cheese meat chicken fish apple banana orange
fruit vegetable salad soup cake chocolate sugar salt breakfast lunch dinner meal
color colour red blue green yellow black white brown pink orange grey gray purple
big small little long short tall high low old new young good bad nice beautiful pretty ugly happy sad
angry tired hungry thirsty hot cold warm cool fast slow easy difficult hard early late right wrong
cheap expensive rich poor clean dirty full empty open closed busy free quiet loud kind funny friendly
favourite favorite great fine ok okay sure ready important interesting boring different same best better
one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen
eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand first second third
in on at to from of for with without about after before under over near next behind between into out up down
off around across along by until during inside outside
now always usually often sometimes never every again only just still already soon later
well really much together alone lot both neither homework tonight grandparents
music song film movie game sport football basketball tennis volleyball team match ball goal
dog cat bird horse cow animal tree flower sea river mountain beach sun rain snow weather sky
head face eye ear nose mouth hand arm leg foot feet hair body
money price number name age birthday party holiday job thing way place world country language english
turkish turkey hello hi goodbye bye please thank thanks sorry excuse welcome
question word sentence story letter news
`;

const A2_WORDS = `
ago already yet ever since while though although however maybe perhaps probably especially
able afraid agree allow almost alone along angry another anyone anything anywhere appear apartment area
army arrange art article asleep attack attend aunt avoid award awful
background bake balcony band bar basket bath battery beard beat become bell belong belt bill biology
birth blanket blood board boat boil bone border borrow boss bottle bottom bowl brain branch brave
break bridge bright broken brush build building burn business butter button
cabbage calendar camera camp cancel capital captain card care careful carpet case castle cause
celebrate center centre century certain chance character charge chat cheese chemistry chef chess chicken
choice church cinema circle clever climate clock clothes cloud club coast coat collect college comedy
comfortable common company compare competition complete concert condition contact continue conversation
copy corner correct cost costume cotton count couple course court cousin cover crazy cream create
crowd culture cup customer cut cycle
damage danger dangerous dark date dead deal dear decide decision deep degree delicious dentist depend
describe desert design dessert detail diary dictionary die diet difference dinosaur direction dirty
discover discuss dish doctor document dollar double download drama dream dress drop dry
each ear earth east education effect egg either electric elephant else empty end enemy energy engine
enjoy enough enter environment equipment euro even event everybody everyone everything everywhere exam
example excellent exciting exercise exhibition exist exit expect experience expert explain extra
fact factory fail fair famous fan fantastic far farm fashion fat fear festival fever field fight fill
final finger fire fit fix flat flight floor flu follow foreign forest fork form forward fresh fridge
fridge front fruit fun furniture future
garage gas gate general gift glass glove god gold golf government grade grammar grass ground group guess
guest guide guitar gym
habit half hall hang happen hard hate health healthy heart heavy height helmet hero hide hill history
hobby hole honest horror hospital host hour huge human hurry hurt
ice idea ill illness imagine improve include information insect instead instrument internet introduce
invent invitation invite island
jacket jeans jewellery join joke journey juice
keep key keyboard kill kilometre kind king kiss knife knock
lake land laptop last laugh law lazy lead leaf learn least leather lemon lend less let level library lie
life lift light line lion list litre local lock lonely lose loud lucky luggage
machine magazine mail main manager many marry match maths matter meal mean meaning medicine member memory
menu mess metal metre middle mile mind minute mirror miss mistake mix model modern moment monkey moon
motorbike mouse movie mud museum
nation natural nature neck neighbour nervous net network newspaper noise noisy none normal north note
nothing notice novel
ocean offer oil once online opinion opposite order ordinary organise outdoor own owner
pack page pain pair palace pan paragraph parent part partner pass passenger passport past path patient
pay peace pepper perfect perform period pet piano pick piece pilot pink plan planet plant plastic plate
platform pleasant pocket poem point police polite pollution pool popular possible post potato pound
practice practise prefer prepare present president prize problem produce product programme project
promise protect proud public pull push puzzle
quality queen queue quick quickly quite
race radio railway rain raise rarely reach real reason receive recipe record recycle relax remove rent
repair repeat reply report rest result return review rice rich ring rise risk rock role roof round
rule ruler
safe sail sale sand sandwich save scared scarf science scientist score screen search seat secret
section seem sense separate serious serve service set several shape share sharp sheep shelf shine ship
shirt shoe shop shopping shout shower shy sick side sign silver simple since single size skate ski skill
skirt sleep slice smell smoke snack soap social sock soft soldier solve somebody someone something
sometimes somewhere sound south space special spell spend spoon square stage stairs star stay steal
step stomach stone storm straight strange stranger strong stupid subject success suddenly suit
suitcase surprise sweater sweet swimming symbol
tail take talent taste team technology teenager temperature tent terrible test text theatre thick thin
thief though throat ticket tidy tie tiny tired toe toilet tomato tongue tool tooth top topic total tour
tourist towel tower toy traffic trainer translate trip trouble trousers truck true trust truth
type typical
umbrella uncle uniform unit university unusual upstairs useful usual
valley various vegetable video view village violin visitor voice volleyball
waiter wallet war warm wave weak wear website wedding weight west wet whale wheel whole wide wild wind
wing winner wonderful wood wool worry worse worst wrong
yard yesterday young youth
zero zone zoo
`;

/** Her seviyede her zaman bilinen işlev sözcükleri ve kısaltma parçaları. */
const FUNCTION = `
s t re ll ve d m e o don doesn didn isn aren wasn weren can't won couldn shouldn wouldn haven hasn hadn
o'clock mr mrs ms ok
`;

const IRREGULAR: Record<string, string> = {
  went: "go", gone: "go", saw: "see", seen: "see", came: "come", took: "take", taken: "take", gave: "give",
  given: "give", got: "get", gotten: "get", made: "make", ate: "eat", eaten: "eat", drank: "drink",
  drunk: "drink", wrote: "write", written: "write", read: "read", ran: "run", swam: "swim", drove: "drive",
  driven: "drive", rode: "ride", flew: "fly", flown: "fly", sat: "sit", stood: "stand", began: "begin",
  begun: "begin", bought: "buy", sold: "sell", paid: "pay", found: "find", lost: "lose", won: "win",
  wore: "wear", worn: "wear", met: "meet", sent: "send", put: "put", left: "leave", brought: "bring",
  taught: "teach", understood: "understand", forgot: "forget", forgotten: "forget", felt: "feel",
  sang: "sing", sung: "sing", drew: "draw", drawn: "draw", fell: "fall", fallen: "fall", grew: "grow",
  grown: "grow", knew: "know", known: "know", thought: "think", said: "say", told: "tell", spoke: "speak",
  spoken: "speak", heard: "hear", had: "have", did: "do", done: "do", was: "be", were: "be", been: "be",
  slept: "sleep", woke: "wake", woken: "wake", caught: "catch", threw: "throw", thrown: "throw",
  chose: "choose", chosen: "choose", children: "child", men: "man", women: "woman", people: "person",
  feet: "foot", teeth: "tooth", mice: "mouse", better: "good", best: "good", worse: "bad", worst: "bad",
  built: "build", broke: "break", broken: "break", kept: "keep", spent: "spend", lent: "lend", hung: "hang",
  hid: "hide", hidden: "hide", lay: "lie", lit: "light", rose: "rise", shone: "shine", stole: "steal",
  stolen: "steal", hurt: "hurt", cost: "cost", cut: "cut", let: "let", set: "set", shut: "shut",
};

const toSet = (s: string) => new Set(s.split(/\s+/).map((w) => w.trim().toLowerCase()).filter(Boolean));
export const A1_SET = toSet(A1_WORDS + FUNCTION);
export const A2_SET = new Set([...A1_SET, ...toSet(A2_WORDS)]);

/** Basit gövdeleme: düzensiz biçimler, -s/-es/-ies, -ed/-ied, -ing, -er/-est, -ly. */
export function lemmaCandidates(word: string): string[] {
  const w = word.toLowerCase();
  const out = new Set<string>([w]);
  if (IRREGULAR[w]) out.add(IRREGULAR[w]);
  const strip = (suf: string, add = "") => {
    if (w.endsWith(suf) && w.length > suf.length + 1) out.add(w.slice(0, -suf.length) + add);
  };
  strip("s");
  strip("es");
  strip("ies", "y");
  strip("ed");
  strip("ed", "e");
  strip("d");
  strip("ied", "y");
  strip("ing");
  strip("ing", "e");
  strip("er");
  strip("er", "e");
  strip("est");
  strip("est", "e");
  strip("ier", "y");
  strip("iest", "y");
  strip("ly");
  strip("ily", "y");
  // ikiz ünsüz: running → run, stopped → stop, bigger → big
  for (const suf of ["ing", "ed", "er", "est"]) {
    if (w.endsWith(suf)) {
      const stem = w.slice(0, -suf.length);
      if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) out.add(stem.slice(0, -1));
    }
  }
  return [...out];
}

/** İlgi alanı temalarının sık sözcükleri: kapsama ölçümünde bilinen sayılır (temalı içerik). */
export const INTEREST_WORDS: Record<string, string[]> = {
  football: ["football", "team", "match", "goal", "player", "coach", "stadium", "fan", "score", "league", "kick", "pitch"],
  other_sports: ["sport", "basketball", "tennis", "volleyball", "race", "runner", "gym", "swimming", "medal", "coach"],
  gaming: ["game", "gamer", "level", "player", "console", "online", "screen", "score", "team", "app"],
  music: ["music", "song", "singer", "band", "concert", "guitar", "piano", "album", "playlist", "stage"],
  series_film: ["film", "movie", "series", "episode", "actor", "actress", "cinema", "scene", "character", "season"],
  tech: ["phone", "computer", "laptop", "app", "internet", "website", "online", "robot", "screen", "battery", "camera"],
  social_media: ["photo", "video", "post", "like", "follower", "app", "online", "message", "share", "comment"],
  fashion: ["clothes", "dress", "shirt", "jacket", "shoes", "jeans", "style", "model", "colour", "bag"],
  food: ["food", "restaurant", "cook", "recipe", "meal", "dish", "pizza", "salad", "dessert", "kitchen"],
  travel: ["travel", "trip", "holiday", "hotel", "ticket", "plane", "airport", "beach", "tourist", "passport", "map"],
  science_space: ["space", "planet", "star", "moon", "earth", "rocket", "science", "scientist", "sky", "astronaut"],
  cars: ["car", "drive", "driver", "engine", "road", "race", "speed", "garage", "wheel", "fast"],
};

export interface Coverage {
  /** Bilinen sözcük / sayılan sözcük (0..1). */
  ratio: number;
  counted: number;
  unknown: string[];
}

/**
 * Metnin seviye listesine göre kapsaması. Özel adlar (cümle başı dışında büyük harfle başlayanlar),
 * sayılar ve `extra` (konunun hedef sözcükleri, öğrencinin ilgi alanı sözcükleri) sayılmaz/bilinir.
 */
export function coverage(text: string, level: "A1" | "A2", extra: readonly string[] = []): Coverage {
  const known = level === "A1" ? A1_SET : A2_SET;
  const extraSet = new Set(extra.map((e) => e.toLowerCase()));
  const unknown: string[] = [];
  let counted = 0;
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const tokens = sentence.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
    tokens.forEach((raw, i) => {
      const tok = raw.replace(/’/g, "'");
      const isKnown = (w: string) => extraSet.has(w) || lemmaCandidates(w).some((l) => known.has(l) || extraSet.has(l));
      // Özel ad: büyük harfle başlayan ve listede olmayan sözcük (Ali, Izmir, Galatasaray).
      if (/^[A-Z]/.test(tok) && tok.toLowerCase() !== "i" && !isKnown(tok.toLowerCase())) return;
      void i;
      const parts = tok.toLowerCase().split(/['-]/).filter(Boolean);
      for (const part of parts) {
        counted++;
        const ok = extraSet.has(part) || lemmaCandidates(part).some((l) => known.has(l) || extraSet.has(l));
        if (!ok) unknown.push(part);
      }
    });
  }
  return { ratio: counted === 0 ? 1 : (counted - unknown.length) / counted, counted, unknown };
}
