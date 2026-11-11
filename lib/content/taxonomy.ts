// ÜRETİLMİŞ DOSYA, elle düzenlemeyin. Kaynak: supabase/seed/topics.csv, l1_codes.csv
// Yeniden üret: npx tsx scripts/build-seed.ts

export interface TaxonomyTopic {
  id: string;
  level: "A1" | "A2";
  kind: "grammar" | "pron";
  title_tr: string;
  title_en: string;
  active: boolean;
}

export interface TaxonomyL1Code {
  code: string;
  topic_id: string | null;
  is_l1: boolean;
  name_tr: string;
  rule_tr: string | null;
  wrong_example: string | null;
  right_example: string | null;
}

export const TOPICS: readonly TaxonomyTopic[] = [
  {
    "id": "g.be_present",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "am / is / are",
    "title_en": "Present of be",
    "active": true
  },
  {
    "id": "g.subject_pronouns",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "Özne zamirleri (he / she / it)",
    "title_en": "Subject pronouns",
    "active": true
  },
  {
    "id": "g.possessives",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "İyelik sıfatları (my / his / her)",
    "title_en": "Possessive adjectives",
    "active": true
  },
  {
    "id": "g.articles_a_an",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "a / an",
    "title_en": "Indefinite articles",
    "active": true
  },
  {
    "id": "g.articles_the",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "the",
    "title_en": "Definite article",
    "active": true
  },
  {
    "id": "g.plurals",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "Çoğul -s, sayılarla çoğul",
    "title_en": "Plural nouns",
    "active": true
  },
  {
    "id": "g.there_is_are",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "there is / there are",
    "title_en": "There is / there are",
    "active": true
  },
  {
    "id": "g.present_simple",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "Geniş zaman (present simple)",
    "title_en": "Present simple",
    "active": true
  },
  {
    "id": "g.present_simple_3sg",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "Üçüncü tekil -s",
    "title_en": "Third person -s",
    "active": true
  },
  {
    "id": "g.do_does_q_neg",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "do / does ile soru ve olumsuz",
    "title_en": "Questions and negatives with do / does",
    "active": true
  },
  {
    "id": "g.have_has",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "have / has",
    "title_en": "Have / has",
    "active": true
  },
  {
    "id": "g.can",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "can (yetenek, izin)",
    "title_en": "Can for ability and permission",
    "active": true
  },
  {
    "id": "g.present_continuous",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "Şimdiki zaman (present continuous)",
    "title_en": "Present continuous",
    "active": true
  },
  {
    "id": "g.prep_time",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "in / on / at (zaman)",
    "title_en": "Prepositions of time: in, on, at",
    "active": true
  },
  {
    "id": "g.prep_place",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "in / on / at, under, next to (yer)",
    "title_en": "Prepositions of place",
    "active": true
  },
  {
    "id": "g.wh_questions",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "Wh- soruları ve soru sırası",
    "title_en": "Wh- questions and word order",
    "active": true
  },
  {
    "id": "g.object_pronouns",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "me / him / her / them",
    "title_en": "Object pronouns",
    "active": true
  },
  {
    "id": "g.some_any_much_many",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "some / any, much / many",
    "title_en": "Some / any, much / many",
    "active": true
  },
  {
    "id": "g.adverbs_frequency",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "always / usually … ve yeri",
    "title_en": "Adverbs of frequency",
    "active": true
  },
  {
    "id": "g.word_order_svo",
    "level": "A1",
    "kind": "grammar",
    "title_tr": "Temel cümle sırası (özne-fiil-nesne)",
    "title_en": "Basic word order (SVO)",
    "active": true
  },
  {
    "id": "g.past_be",
    "level": "A2",
    "kind": "grammar",
    "title_tr": "was / were",
    "title_en": "Past of be",
    "active": true
  },
  {
    "id": "g.past_simple_regular",
    "level": "A2",
    "kind": "grammar",
    "title_tr": "Geçmiş zaman, düzenli fiiller",
    "title_en": "Past simple: regular verbs",
    "active": true
  },
  {
    "id": "g.past_simple_irregular",
    "level": "A2",
    "kind": "grammar",
    "title_tr": "Geçmiş zaman, düzensiz fiiller",
    "title_en": "Past simple: irregular verbs",
    "active": true
  },
  {
    "id": "g.past_q_neg",
    "level": "A2",
    "kind": "grammar",
    "title_tr": "did ile soru ve olumsuz",
    "title_en": "Past questions and negatives with did",
    "active": true
  },
  {
    "id": "g.going_to",
    "level": "A2",
    "kind": "grammar",
    "title_tr": "be going to",
    "title_en": "Be going to",
    "active": true
  },
  {
    "id": "g.will_future",
    "level": "A2",
    "kind": "grammar",
    "title_tr": "will",
    "title_en": "Will for the future",
    "active": true
  },
  {
    "id": "g.comparatives",
    "level": "A2",
    "kind": "grammar",
    "title_tr": "Karşılaştırma ve üstünlük",
    "title_en": "Comparatives and superlatives",
    "active": true
  },
  {
    "id": "g.present_perfect",
    "level": "A2",
    "kind": "grammar",
    "title_tr": "Present perfect (ever / never / already / yet)",
    "title_en": "Present perfect",
    "active": true
  },
  {
    "id": "g.modals_obligation",
    "level": "A2",
    "kind": "grammar",
    "title_tr": "should / must / have to",
    "title_en": "Should, must, have to",
    "active": true
  },
  {
    "id": "g.verb_patterns",
    "level": "A2",
    "kind": "grammar",
    "title_tr": "want to / like -ing",
    "title_en": "Verb patterns: to / -ing",
    "active": true
  },
  {
    "id": "p.th",
    "level": "A1",
    "kind": "pron",
    "title_tr": "th sesi (algı: think / sink)",
    "title_en": "The th sounds",
    "active": true
  },
  {
    "id": "p.w_v",
    "level": "A1",
    "kind": "pron",
    "title_tr": "w / v ayrımı (algı: wine / vine)",
    "title_en": "W and v sounds",
    "active": true
  }
];

export const L1_CODES: readonly TaxonomyL1Code[] = [
  {
    "code": "L1.ART_OMIT",
    "topic_id": "g.articles_a_an",
    "is_l1": true,
    "name_tr": "Artikel atlama",
    "rule_tr": "Türkçede \"bir\" çoğu zaman söylenmez; İngilizcede tekil sayılabilir isim artikelsiz kalmaz.",
    "wrong_example": "I have car.",
    "right_example": "I have a car."
  },
  {
    "code": "L1.ART_THE",
    "topic_id": "g.articles_the",
    "is_l1": true,
    "name_tr": "the'yi fazla ya da eksik kullanma",
    "rule_tr": "Türkçede belirlilik bağlamdan anlaşılır; İngilizcede genel anlamda the kullanılmaz.",
    "wrong_example": "The life is hard.",
    "right_example": "Life is hard."
  },
  {
    "code": "L1.HE_SHE",
    "topic_id": "g.subject_pronouns",
    "is_l1": true,
    "name_tr": "he / she / it karışıklığı",
    "rule_tr": "Türkçede \"o\" cinsiyetsizdir; İngilizcede ayrılır.",
    "wrong_example": "My sister, he is a doctor.",
    "right_example": "My sister, she is a doctor."
  },
  {
    "code": "L1.HIS_HER",
    "topic_id": "g.possessives",
    "is_l1": true,
    "name_tr": "his / her karışıklığı",
    "rule_tr": "Türkçe iyelik eki (-ı, -i) cinsiyet taşımaz.",
    "wrong_example": "My mother loves his job.",
    "right_example": "My mother loves her job."
  },
  {
    "code": "L1.SUBJ_DROP",
    "topic_id": "g.subject_pronouns",
    "is_l1": true,
    "name_tr": "Özne düşürme",
    "rule_tr": "Türkçede özne fiil ekinden anlaşılır; İngilizcede özne zorunludur.",
    "wrong_example": "Is very good.",
    "right_example": "It is very good."
  },
  {
    "code": "L1.BE_OMIT",
    "topic_id": "g.be_present",
    "is_l1": true,
    "name_tr": "be fiilini atlama",
    "rule_tr": "Türkçede ek-fiil (-dır) çoğu zaman söylenmez.",
    "wrong_example": "She happy.",
    "right_example": "She is happy."
  },
  {
    "code": "L1.3SG_S",
    "topic_id": "g.present_simple_3sg",
    "is_l1": true,
    "name_tr": "Üçüncü tekil -s eksikliği",
    "rule_tr": "İngilizcede yalnızca he / she / it ile fiile -s gelir.",
    "wrong_example": "He play football.",
    "right_example": "He plays football."
  },
  {
    "code": "L1.DO_SUPPORT",
    "topic_id": "g.do_does_q_neg",
    "is_l1": true,
    "name_tr": "do / does / did eksikliği ya da yanlışı",
    "rule_tr": "Türkçede olumsuzluk fiile ek (-me) olarak gelir; İngilizcede yardımcı fiil gerekir.",
    "wrong_example": "She don't like. / I not like.",
    "right_example": "She doesn't like. / I don't like."
  },
  {
    "code": "L1.Q_INVERSION",
    "topic_id": "g.wh_questions",
    "is_l1": true,
    "name_tr": "Soru yapısı (yardımcı fiil, sıra)",
    "rule_tr": "Türkçede soru -mı eki ve tonlamayla yapılır; İngilizcede sıra değişir.",
    "wrong_example": "Where you live?",
    "right_example": "Where do you live?"
  },
  {
    "code": "L1.WORD_ORDER_SOV",
    "topic_id": "g.word_order_svo",
    "is_l1": true,
    "name_tr": "Fiili sona koyma",
    "rule_tr": "Türkçe özne-nesne-fiil, İngilizce özne-fiil-nesne dizilir.",
    "wrong_example": "I football play.",
    "right_example": "I play football."
  },
  {
    "code": "L1.PLURAL_NUM",
    "topic_id": "g.plurals",
    "is_l1": true,
    "name_tr": "Sayıdan sonra çoğul eksikliği",
    "rule_tr": "Türkçede sayıdan sonra çoğul eki gelmez (\"iki kitap\").",
    "wrong_example": "two book",
    "right_example": "two books"
  },
  {
    "code": "L1.COUNT_UNCOUNT",
    "topic_id": "g.some_any_much_many",
    "is_l1": true,
    "name_tr": "Sayılabilir / sayılamaz karışıklığı",
    "rule_tr": "Türkçede bu ayrım dilbilgisel olarak işaretlenmez.",
    "wrong_example": "many water, informations",
    "right_example": "much water, information"
  },
  {
    "code": "L1.PREP_IN_ON_AT",
    "topic_id": "g.prep_time",
    "is_l1": true,
    "name_tr": "in / on / at karışıklığı",
    "rule_tr": "Türkçedeki tek -de/-da eki İngilizcede üç edata ayrılır.",
    "wrong_example": "in Monday",
    "right_example": "on Monday"
  },
  {
    "code": "L1.THERE_HAVE",
    "topic_id": "g.there_is_are",
    "is_l1": true,
    "name_tr": "\"var\" yapısı",
    "rule_tr": "Türkçedeki \"var\", İngilizcede there is ya da have ile karşılanır.",
    "wrong_example": "In my city has a park.",
    "right_example": "There is a park in my city."
  },
  {
    "code": "L1.SIMPLE_CONT",
    "topic_id": "g.present_simple",
    "is_l1": true,
    "name_tr": "Geniş / şimdiki zaman karışıklığı",
    "rule_tr": "Türkçe -yor hem şu ana hem alışkanlığa kullanılır.",
    "wrong_example": "I am going to school every day.",
    "right_example": "I go to school every day."
  },
  {
    "code": "L1.PERFECT_PAST",
    "topic_id": "g.present_perfect",
    "is_l1": true,
    "name_tr": "Present perfect / past simple karışıklığı",
    "rule_tr": "Türkçe -di iki anlamı da karşılar; belirli geçmiş zamanla present perfect kullanılmaz.",
    "wrong_example": "I have seen him yesterday.",
    "right_example": "I saw him yesterday."
  },
  {
    "code": "L1.VERB_PATTERN",
    "topic_id": "g.verb_patterns",
    "is_l1": true,
    "name_tr": "Mastar yapısı (to / -ing)",
    "rule_tr": "Türkçede mastar eki fiile bağlıdır (gitmek); İngilizcede ayrı \"to\" gerekir.",
    "wrong_example": "I want go.",
    "right_example": "I want to go."
  },
  {
    "code": "L1.LITERAL",
    "topic_id": null,
    "is_l1": true,
    "name_tr": "Kelime kelime çeviri ve kalıp",
    "rule_tr": "Türkçe kalıbı birebir çevirmek İngilizcede yanlış yapı üretir.",
    "wrong_example": "I am agree. / make sport",
    "right_example": "I agree. / do sport"
  },
  {
    "code": "L1.TH_SOUND",
    "topic_id": "p.th",
    "is_l1": true,
    "name_tr": "th sesi",
    "rule_tr": "Türkçede th sesi yoktur; t, d, s ile karışır.",
    "wrong_example": "sink (think yerine)",
    "right_example": "think"
  },
  {
    "code": "L1.W_V",
    "topic_id": "p.w_v",
    "is_l1": true,
    "name_tr": "w / v ayrımı",
    "rule_tr": "Türkçede w sesi yoktur; v ile karışır.",
    "wrong_example": "vine (wine yerine)",
    "right_example": "wine"
  },
  {
    "code": "GEN.VERB_FORM",
    "topic_id": null,
    "is_l1": false,
    "name_tr": "Yanlış fiil biçimi",
    "rule_tr": "Türkçe kaynaklı değil.",
    "wrong_example": "He goed.",
    "right_example": "He went."
  },
  {
    "code": "GEN.SPELLING",
    "topic_id": null,
    "is_l1": false,
    "name_tr": "Yazım",
    "rule_tr": null,
    "wrong_example": "becuase",
    "right_example": "because"
  },
  {
    "code": "GEN.VOCAB",
    "topic_id": null,
    "is_l1": false,
    "name_tr": "Yanlış kelime seçimi",
    "rule_tr": null,
    "wrong_example": null,
    "right_example": null
  },
  {
    "code": "GEN.OTHER",
    "topic_id": null,
    "is_l1": false,
    "name_tr": "Diğer",
    "rule_tr": null,
    "wrong_example": null,
    "right_example": null
  }
];

export const TOPIC_IDS = [
  "g.be_present",
  "g.subject_pronouns",
  "g.possessives",
  "g.articles_a_an",
  "g.articles_the",
  "g.plurals",
  "g.there_is_are",
  "g.present_simple",
  "g.present_simple_3sg",
  "g.do_does_q_neg",
  "g.have_has",
  "g.can",
  "g.present_continuous",
  "g.prep_time",
  "g.prep_place",
  "g.wh_questions",
  "g.object_pronouns",
  "g.some_any_much_many",
  "g.adverbs_frequency",
  "g.word_order_svo",
  "g.past_be",
  "g.past_simple_regular",
  "g.past_simple_irregular",
  "g.past_q_neg",
  "g.going_to",
  "g.will_future",
  "g.comparatives",
  "g.present_perfect",
  "g.modals_obligation",
  "g.verb_patterns",
  "p.th",
  "p.w_v"
] as const;
export type TopicId = (typeof TOPIC_IDS)[number];

export const L1_CODE_IDS = [
  "L1.ART_OMIT",
  "L1.ART_THE",
  "L1.HE_SHE",
  "L1.HIS_HER",
  "L1.SUBJ_DROP",
  "L1.BE_OMIT",
  "L1.3SG_S",
  "L1.DO_SUPPORT",
  "L1.Q_INVERSION",
  "L1.WORD_ORDER_SOV",
  "L1.PLURAL_NUM",
  "L1.COUNT_UNCOUNT",
  "L1.PREP_IN_ON_AT",
  "L1.THERE_HAVE",
  "L1.SIMPLE_CONT",
  "L1.PERFECT_PAST",
  "L1.VERB_PATTERN",
  "L1.LITERAL",
  "L1.TH_SOUND",
  "L1.W_V",
  "GEN.VERB_FORM",
  "GEN.SPELLING",
  "GEN.VOCAB",
  "GEN.OTHER"
] as const;
export type L1CodeId = (typeof L1_CODE_IDS)[number];
