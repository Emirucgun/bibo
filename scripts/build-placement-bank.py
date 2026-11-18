"""Yerleştirme bankasının TASLAK kaynağı → supabase/seed/placement_bank.json.

İçeriği pedagoji sahibi onaylar ve düzenler (zorluk sıralaması dahil). Bu dosya taslağın üretildiği
yerdir; onaydan sonra JSON doğrudan düzenlenebilir. Çalıştır: python3 scripts/build-placement-bank.py

Zorluk önseli (b): CEFR bandı içinde uzman tahmini. Bantlar (θ ölçeği): preA1 [−3, −1,5),
A1 [−1,5, 0), A2 [0, 1,5), B1 [1,5, 3), B2 [3, 4,5). Pilot verisiyle kalibre edilir (item_calibration).
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "supabase/seed/placement_bank.json"

# Ayırt edicilik ve tahmin payı önselleri (madde türüne göre)
A = {"mcq_read": 0.9, "listen_choose": 0.9, "gap_fill": 1.2, "word_order": 1.1, "dictation": 1.2}
C = {"mcq_read": 0.25, "listen_choose": 0.25, "gap_fill": 0.02, "word_order": 0.05, "dictation": 0.0}
D = 0.97

INSTR = {
    "mcq_read": "Cümleyi oku ve boşluğa uyan seçeneği seç.",
    "mcq_sentence": "Doğru cümleyi seç.",
    "gap_fill_verb": "Boşluğa parantez içindeki kelimenin doğru biçimini yaz.",
    "gap_fill_word": "Boşluğa uygun tek kelimeyi yaz.",
    "word_order": "Kelimeleri doğru sıraya koyarak cümleyi kur.",
    "listen_choose": "Dinle ve soruya uygun cevabı seç.",
    "dictation": "Dinle ve duyduğun cümleyi aynen yaz.",
}

items = []


def add(cefr, topic, kind, l1, b, payload, key, instr):
    n = sum(1 for i in items if i["cefr"] == cefr) + 1
    activity = "mcq_read" if kind == "mcq" else kind
    items.append({
        "id": f"{cefr.lower()}-{n:02d}",
        "cefr": cefr,
        "topic_id": topic,
        "activity_type": activity,
        "l1_target": l1,
        "irt": {"a": A[activity], "b": b, "c": C[activity], "d": D},
        "payload": {"instruction_tr": INSTR[instr], **payload},
        "key": key,
    })


def mcq(cefr, topic, l1, b, text, options, correct, codes, sentence=False):
    """Boşluklu cümle (ya da doğru cümleyi seç). `codes`: doğru dışındaki şıkların hata kodları, sırayla."""
    wrong = [o for i, o in enumerate(options) if i != correct]
    payload = {"text_en": text, "question_en": "Which sentence is correct?" if sentence else "Which option goes in the gap?", "options": options}
    if sentence:
        payload.pop("text_en")
    key = {"correct": options[correct], "distractors": [{"option": o, "code": c, "feedback_tr": ""} for o, c in zip(wrong, codes)]}
    add(cefr, topic, "mcq", l1, b, payload, key, "mcq_sentence" if sentence else "mcq_read")


def gap(cefr, topic, l1, b, text, accepted, wrong=(), verb=True):
    key = {"accepted": accepted, "wrong_patterns": [{"answer": w, "code": c} for w, c in wrong]}
    add(cefr, topic, "gap_fill", l1, b, {"text_en": text}, key, "gap_fill_verb" if verb else "gap_fill_word")


def order(cefr, topic, l1, b, tokens, accepted):
    add(cefr, topic, "word_order", l1, b, {"tokens": tokens}, {"accepted": accepted}, "word_order")


def listen(cefr, topic, l1, b, spoken, question, options, correct, codes):
    wrong = [o for i, o in enumerate(options) if i != correct]
    key = {"correct": options[correct], "text_en": spoken, "distractors": [{"option": o, "code": c, "feedback_tr": ""} for o, c in zip(wrong, codes)]}
    add(cefr, topic, "listen_choose", l1, b, {"question_en": question, "options": options}, key, "listen_choose")


def dictate(cefr, topic, l1, b, sentence, targets):
    add(cefr, topic, "dictation", l1, b, {}, {"correct": sentence, "text_en": sentence, "target_words": targets}, "dictation")


V, O, BE, S3, DO, Q = "GEN.VERB_FORM", "GEN.OTHER", "L1.BE_OMIT", "L1.3SG_S", "L1.DO_SUPPORT", "L1.Q_INVERSION"

# ---------------------------------------------------------------- pre-A1 (12)
mcq("preA1", "g.be_present", "L1.BE_OMIT", -2.8, "I ___ Ayşe.", ["am", "is", "are", "be"], 0, [V, V, V])
mcq("preA1", "g.subject_pronouns", "L1.HE_SHE", -2.6, "This is my father. ___ is a teacher.", ["He", "She", "It", "They"], 0, ["L1.HE_SHE", "L1.HE_SHE", V])
mcq("preA1", "g.articles_a_an", "L1.ART_OMIT", -2.4, "It is ___ apple.", ["an", "a", "the", "two"], 0, [O, "L1.ART_THE", "L1.PLURAL_NUM"])
mcq("preA1", "g.plurals", "L1.PLURAL_NUM", -2.2, "I have two ___.", ["cats", "cat", "cates", "a cat"], 0, ["L1.PLURAL_NUM", "GEN.SPELLING", "L1.ART_OMIT"])
gap("preA1", "g.be_present", "L1.BE_OMIT", -2.0, "They ___ (be) my friends.", ["are"], [("is", V), ("be", V), ("-", BE)])
mcq("preA1", "g.possessives", "L1.HIS_HER", -2.0, "My name is Can. ___ name is Can.", ["My", "Me", "I", "Mine"], 0, ["L1.HIS_HER", "L1.SUBJ_DROP", O])
order("preA1", "g.word_order_svo", "L1.WORD_ORDER_SOV", -1.9, ["I", "like", "tea."], ["I like tea."])
listen("preA1", "g.be_present", "L1.BE_OMIT", -2.5, "Hello, I am Mert. I am twenty.", "How old is Mert?", ["20", "12", "2", "22"], 0, ["GEN.VOCAB", "GEN.VOCAB", "GEN.VOCAB"])
mcq("preA1", "g.there_is_are", "L1.THERE_HAVE", -1.7, "___ a book on the table.", ["There is", "There are", "It have", "Is"], 0, ["L1.PLURAL_NUM", "L1.THERE_HAVE", "L1.SUBJ_DROP"])
dictate("preA1", "g.be_present", "L1.BE_OMIT", -1.8, "She is my sister.", ["is", "sister"])
mcq("preA1", "g.can", None, -1.8, "I ___ swim.", ["can", "cans", "can to", "am can"], 0, [V, "L1.VERB_PATTERN", BE])
gap("preA1", "g.subject_pronouns", "L1.SUBJ_DROP", -1.6, "My mother is a nurse. ___ works in a hospital.", ["she"], [("he", "L1.HE_SHE"), ("it", "L1.HE_SHE"), ("-", "L1.SUBJ_DROP")], verb=False)

# ---------------------------------------------------------------- A1 (30)
mcq("A1", "g.present_simple_3sg", S3, -1.4, "My brother ___ football every Saturday.", ["plays", "play", "playing", "is play"], 0, [S3, V, BE])
gap("A1", "g.present_simple_3sg", S3, -1.2, "Elif ___ (watch) TV every evening.", ["watches"], [("watch", S3), ("watchs", "GEN.SPELLING"), ("watching", V)])
mcq("A1", "g.do_does_q_neg", DO, -1.1, "Mert ___ like fish.", ["doesn't", "don't", "not", "isn't"], 0, [DO, DO, BE])
mcq("A1", "g.do_does_q_neg", Q, -1.0, "___ you speak English?", ["Do", "Does", "Are", "Is"], 0, [DO, BE, BE])
gap("A1", "g.do_does_q_neg", DO, -0.8, "I ___ (not / like) coffee.", ["don't like", "do not like"], [("not like", DO), ("doesn't like", DO), ("no like", DO)])
mcq("A1", "g.wh_questions", Q, -0.9, "Where ___ you live?", ["do", "are", "does", "you"], 0, [BE, DO, Q])
order("A1", "g.wh_questions", Q, -0.6, ["What", "do", "you", "want?"], ["What do you want?"])
mcq("A1", "g.present_simple", "L1.SIMPLE_CONT", -1.0, "Every morning I ___ to school by bus.", ["go", "am going", "going", "goes"], 0, ["L1.SIMPLE_CONT", V, S3])
mcq("A1", "g.present_continuous", "L1.SIMPLE_CONT", -0.8, "Look! The baby ___.", ["is sleeping", "sleeps", "sleeping", "sleep"], 0, ["L1.SIMPLE_CONT", BE, V])
gap("A1", "g.present_continuous", "L1.SIMPLE_CONT", -0.5, "Be quiet, please. I ___ (study) now.", ["am studying", "'m studying"], [("study", "L1.SIMPLE_CONT"), ("studying", BE), ("studies", S3)])
mcq("A1", "g.articles_a_an", "L1.ART_OMIT", -1.3, "I have ___ car.", ["a", "an", "-", "two"], 0, [O, "L1.ART_OMIT", "L1.PLURAL_NUM"], )
gap("A1", "g.articles_a_an", "L1.ART_OMIT", -1.0, "She is ___ engineer.", ["an"], [("a", O), ("-", "L1.ART_OMIT"), ("the", "L1.ART_THE")], verb=False)
mcq("A1", "g.articles_the", "L1.ART_THE", -0.4, "___ sun is very hot today.", ["The", "A", "An", "-"], 0, ["L1.ART_THE", O, "L1.ART_OMIT"])
mcq("A1", "g.prep_time", "L1.PREP_IN_ON_AT", -1.0, "We have an exam ___ Monday.", ["on", "in", "at", "to"], 0, ["L1.PREP_IN_ON_AT", "L1.PREP_IN_ON_AT", O])
gap("A1", "g.prep_time", "L1.PREP_IN_ON_AT", -0.7, "The film starts ___ 8 o'clock.", ["at"], [("in", "L1.PREP_IN_ON_AT"), ("on", "L1.PREP_IN_ON_AT")], verb=False)
mcq("A1", "g.prep_place", "L1.PREP_IN_ON_AT", -1.1, "The keys are ___ the bag.", ["in", "at", "on to", "into at"], 0, ["L1.PREP_IN_ON_AT", O, O])
mcq("A1", "g.have_has", "L1.THERE_HAVE", -1.2, "My sister ___ a new phone.", ["has", "have", "is", "there is"], 0, [S3, BE, "L1.THERE_HAVE"])
mcq("A1", "g.there_is_are", "L1.THERE_HAVE", -0.9, "In my city ___ two big parks.", ["there are", "has", "there is", "have"], 0, ["L1.THERE_HAVE", "L1.PLURAL_NUM", "L1.THERE_HAVE"])
mcq("A1", "g.object_pronouns", "L1.HE_SHE", -0.9, "I know Ali. I see ___ every day.", ["him", "he", "his", "her"], 0, ["L1.HE_SHE", "L1.HIS_HER", "L1.HE_SHE"])
mcq("A1", "g.possessives", "L1.HIS_HER", -0.8, "Ayşe loves ___ job.", ["her", "his", "she", "its"], 0, ["L1.HIS_HER", "L1.HE_SHE", "L1.HIS_HER"])
mcq("A1", "g.some_any_much_many", "L1.COUNT_UNCOUNT", -0.5, "There isn't ___ milk in the fridge.", ["any", "some", "many", "a"], 0, [O, "L1.COUNT_UNCOUNT", "L1.ART_OMIT"])
mcq("A1", "g.some_any_much_many", "L1.COUNT_UNCOUNT", -0.3, "How ___ water do you drink?", ["much", "many", "a lot", "any"], 0, ["L1.COUNT_UNCOUNT", O, O])
mcq("A1", "g.adverbs_frequency", "L1.WORD_ORDER_SOV", -0.7, "Which sentence is correct?", ["He always gets up early.", "He gets always up early.", "Always he gets up early.", "He gets up early always."], 0, ["L1.WORD_ORDER_SOV", "L1.WORD_ORDER_SOV", "L1.WORD_ORDER_SOV"], sentence=True)
order("A1", "g.word_order_svo", "L1.WORD_ORDER_SOV", -1.0, ["We", "play", "football", "after", "school."], ["We play football after school."])
order("A1", "g.adverbs_frequency", "L1.WORD_ORDER_SOV", -0.4, ["She", "usually", "reads", "at", "night."], ["She usually reads at night."])
listen("A1", "g.present_simple_3sg", S3, -0.6, "My friend works in a bank.", "Where does the friend work?", ["in a bank", "in a park", "in a shop", "at school"], 0, ["GEN.VOCAB", "GEN.VOCAB", "GEN.VOCAB"])
listen("A1", "g.can", None, -0.7, "I can't drive, but I can ride a bike.", "What can the speaker do?", ["ride a bike", "drive a car", "both", "neither"], 0, [O, O, O])
dictate("A1", "g.present_simple_3sg", S3, -0.4, "He lives near the station.", ["lives"])
dictate("A1", "g.do_does_q_neg", DO, -0.2, "Does she like music?", ["Does", "like"])
listen("A1", "p.w_v", "L1.W_V", -0.6, "wine", "Which word do you hear?", ["wine", "vine", "fine", "line"], 0, ["L1.W_V", "GEN.OTHER", "GEN.OTHER"])

# ---------------------------------------------------------------- A2 (36)
mcq("A2", "g.past_be", BE, 0.1, "I ___ at home yesterday.", ["was", "were", "am", "be"], 0, [V, V, V])
gap("A2", "g.past_be", BE, 0.3, "They ___ (be) tired after the match.", ["were"], [("was", V), ("are", V)])
mcq("A2", "g.past_simple_regular", V, 0.2, "We ___ our grandmother last weekend.", ["visited", "visit", "visits", "are visiting"], 0, [V, S3, "L1.SIMPLE_CONT"])
gap("A2", "g.past_simple_regular", V, 0.4, "She ___ (study) for three hours last night.", ["studied"], [("studyed", "GEN.SPELLING"), ("study", V), ("studies", V)])
mcq("A2", "g.past_simple_irregular", V, 0.3, "Yesterday I ___ a great film.", ["saw", "seed", "see", "seen"], 0, [V, V, V])
gap("A2", "g.past_simple_irregular", V, 0.6, "He ___ (go) to Ankara last month.", ["went"], [("goed", V), ("go", V), ("gone", V)])
gap("A2", "g.past_simple_irregular", V, 0.8, "We ___ (buy) a new sofa last week.", ["bought"], [("buyed", V), ("buy", V)])
mcq("A2", "g.past_q_neg", DO, 0.5, "___ you go to the party on Saturday?", ["Did", "Do", "Were", "Was"], 0, [DO, BE, BE])
gap("A2", "g.past_q_neg", DO, 0.7, "I ___ (not / see) him at school yesterday.", ["didn't see", "did not see"], [("didn't saw", DO), ("not saw", DO), ("don't see", DO)])
order("A2", "g.past_q_neg", Q, 0.8, ["Where", "did", "you", "go", "last", "summer?"], ["Where did you go last summer?"])
mcq("A2", "g.going_to", None, 0.4, "Look at those clouds. It ___ rain.", ["is going to", "goes to", "going to", "is go to"], 0, [V, BE, V])
gap("A2", "g.going_to", None, 0.6, "We ___ (visit) my uncle next weekend. We have the tickets.", ["are going to visit", "'re going to visit", "are visiting"], [("will visit", O), ("visit", V)])
mcq("A2", "g.will_future", None, 0.5, "I'm sure you ___ pass the exam.", ["will", "are", "do", "going"], 0, [BE, DO, V])
mcq("A2", "g.comparatives", None, 0.3, "My brother is ___ than me.", ["taller", "more tall", "tallest", "tall"], 0, [V, V, V])
gap("A2", "g.comparatives", None, 0.7, "This is the ___ (expensive) phone in the shop.", ["most expensive"], [("expensivest", V), ("more expensive", V)])
mcq("A2", "g.comparatives", None, 0.9, "Istanbul is ___ city in Turkey.", ["the biggest", "the bigger", "biggest", "the most big"], 0, [V, "L1.ART_OMIT", V])
mcq("A2", "g.modals_obligation", None, 0.6, "You look ill. You ___ see a doctor.", ["should", "should to", "must to", "have"], 0, ["L1.VERB_PATTERN", "L1.VERB_PATTERN", V])
mcq("A2", "g.modals_obligation", None, 0.9, "In Turkey, you ___ drive on the right.", ["have to", "has to", "must to", "should to"], 0, [S3, "L1.VERB_PATTERN", "L1.VERB_PATTERN"])
mcq("A2", "g.verb_patterns", "L1.VERB_PATTERN", 0.6, "I want ___ a new language.", ["to learn", "learn", "learning", "learns"], 0, ["L1.VERB_PATTERN", "L1.VERB_PATTERN", S3])
gap("A2", "g.verb_patterns", "L1.VERB_PATTERN", 0.9, "She enjoys ___ (cook) for her friends.", ["cooking"], [("to cook", "L1.VERB_PATTERN"), ("cook", "L1.VERB_PATTERN")])
mcq("A2", "g.present_perfect", "L1.PERFECT_PAST", 1.0, "I ___ to London, but I want to go.", ["have never been", "never went", "was never", "have never go"], 0, ["L1.PERFECT_PAST", "L1.PERFECT_PAST", V])
mcq("A2", "g.present_perfect", "L1.PERFECT_PAST", 1.2, "Which sentence is correct?", ["She has already finished her homework.", "She has finished her homework yesterday.", "She already finish her homework.", "She have already finished her homework."], 0, ["L1.PERFECT_PAST", S3, S3], sentence=True)
gap("A2", "g.present_perfect", "L1.PERFECT_PAST", 1.3, "Have you ever ___ (eat) sushi?", ["eaten"], [("ate", "L1.PERFECT_PAST"), ("eat", V), ("eated", V)])
mcq("A2", "g.present_perfect", "L1.PERFECT_PAST", 1.4, "We ___ in this house since 2015.", ["have lived", "live", "lived", "are living"], 0, ["L1.PERFECT_PAST", "L1.PERFECT_PAST", "L1.SIMPLE_CONT"])
mcq("A2", "g.present_continuous", "L1.SIMPLE_CONT", 0.5, "I ___ my grandparents tomorrow. I have the tickets.", ["am visiting", "visit", "visited", "am visit"], 0, ["L1.SIMPLE_CONT", V, V])
mcq("A2", "g.articles_the", "L1.ART_THE", 0.8, "Which sentence is correct?", ["Life is beautiful.", "The life is beautiful.", "A life is beautiful.", "Lifes are beautiful."], 0, ["L1.ART_THE", "L1.ART_OMIT", "L1.PLURAL_NUM"], sentence=True)
mcq("A2", "g.some_any_much_many", "L1.COUNT_UNCOUNT", 0.6, "Can you give me some ___?", ["information", "informations", "an information", "information's"], 0, ["L1.COUNT_UNCOUNT", "L1.COUNT_UNCOUNT", "GEN.SPELLING"])
order("A2", "g.past_simple_irregular", V, 0.7, ["We", "took", "a", "taxi", "to", "the", "airport."], ["We took a taxi to the airport."])
order("A2", "g.going_to", None, 0.9, ["What", "are", "you", "going", "to", "do", "tonight?"], ["What are you going to do tonight?"])
listen("A2", "g.past_simple_irregular", V, 0.5, "Last summer we went to Antalya and stayed in a small hotel.", "Where did they stay?", ["in a small hotel", "with friends", "in a big hotel", "at home"], 0, [O, O, O])
listen("A2", "g.going_to", None, 0.8, "I'm going to start a new job next month.", "When will the speaker start the job?", ["next month", "next week", "last month", "today"], 0, [O, O, O])
listen("A2", "g.comparatives", None, 1.0, "The red jacket is cheaper than the blue one, but the blue one is warmer.", "Which jacket is warmer?", ["the blue one", "the red one", "both", "neither"], 0, [O, O, O])
dictate("A2", "g.past_q_neg", DO, 0.9, "We didn't watch the match last night.", ["didn't", "watch"])
dictate("A2", "g.present_perfect", "L1.PERFECT_PAST", 1.3, "I have never seen the sea.", ["have", "seen"])
listen("A2", "p.th", "L1.TH_SOUND", 0.2, "three", "Which word do you hear?", ["three", "tree", "free", "sree"], 0, ["L1.TH_SOUND", "L1.TH_SOUND", "GEN.OTHER"])
mcq("A2", "g.will_future", None, 1.1, "A: It's cold in here. B: OK, I ___ close the window.", ["will", "am", "do", "going"], 0, [BE, DO, V])

# ---------------------------------------------------------------- B1 (30) — yalnızca ölçme
B1, M1 = "B1", "m.b1"
mcq(B1, M1, None, 1.6, "I ___ TV when the phone rang.", ["was watching", "watched", "am watching", "have watched"], 0, [V, V, "L1.PERFECT_PAST"])
mcq(B1, M1, None, 1.7, "If it rains tomorrow, we ___ at home.", ["will stay", "stay", "would stay", "stayed"], 0, [V, V, V])
gap(B1, M1, None, 1.8, "I ___ (use) to play basketball when I was a child.", ["used"], [("use", V), ("was used", V)])
mcq(B1, M1, None, 1.9, "This bridge ___ in 1973.", ["was built", "built", "is building", "has built"], 0, [V, V, V])
mcq(B1, M1, None, 2.0, "The man ___ lives next door is a pilot.", ["who", "which", "what", "whose"], 0, [O, O, O])
mcq(B1, M1, None, 2.0, "I'm interested ___ learning photography.", ["in", "on", "at", "for"], 0, [O, O, O])
gap(B1, M1, None, 2.1, "She has been ___ (wait) for the bus for twenty minutes.", ["waiting"], [("waited", V), ("wait", V)])
mcq(B1, M1, None, 2.1, "When I arrived at the station, the train ___.", ["had already left", "already left", "has already left", "was already leave"], 0, ["L1.PERFECT_PAST", "L1.PERFECT_PAST", V])
mcq(B1, M1, None, 2.2, "You ___ be tired after such a long journey.", ["must", "should to", "have", "can to"], 0, ["L1.VERB_PATTERN", V, "L1.VERB_PATTERN"])
gap(B1, M1, None, 2.2, "He asked me where I ___ (live).", ["lived"], [("live", V), ("do live", DO)])
mcq(B1, M1, None, 2.3, "I'm looking forward to ___ you.", ["seeing", "see", "seen", "saw"], 0, ["L1.VERB_PATTERN", V, V])
mcq(B1, M1, None, 2.3, "There's ___ time left; we should hurry.", ["little", "few", "many", "a few"], 0, ["L1.COUNT_UNCOUNT", "L1.COUNT_UNCOUNT", "L1.COUNT_UNCOUNT"])
order(B1, M1, None, 2.4, ["Can", "you", "tell", "me", "where", "the", "station", "is?"], ["Can you tell me where the station is?"])
mcq(B1, M1, None, 2.4, "If I ___ more money, I would buy a car.", ["had", "have", "would have", "will have"], 0, [V, V, V])
mcq(B1, M1, None, 2.5, "She made me ___ the whole report again.", ["write", "to write", "writing", "wrote"], 0, ["L1.VERB_PATTERN", "L1.VERB_PATTERN", V])
gap(B1, M1, None, 2.5, "The film was so ___ (bore) that I fell asleep.", ["boring"], [("bored", V)])
mcq(B1, M1, None, 2.6, "Neither my brother ___ my sister likes coffee.", ["nor", "or", "and", "but"], 0, [O, O, O])
mcq(B1, M1, None, 2.6, "By the time she finishes university, she ___ in three countries.", ["will have lived", "lives", "lived", "is living"], 0, [V, V, V])
order(B1, M1, None, 2.7, ["The", "book", "that", "you", "gave", "me", "was", "great."], ["The book that you gave me was great."])
mcq(B1, M1, None, 2.7, "Despite ___ tired, he finished the race.", ["being", "be", "he was", "to be"], 0, [V, O, "L1.VERB_PATTERN"])
listen(B1, M1, None, 1.9, "I was going to call you, but my phone ran out of battery.", "Why didn't the speaker call?", ["the phone battery died", "they forgot", "they were busy", "they had no number"], 0, [O, O, O])
listen(B1, M1, None, 2.3, "If I had known about the meeting, I would have come.", "Did the speaker go to the meeting?", ["No", "Yes", "Yes, late", "We don't know"], 0, [O, O, O])
listen(B1, M1, None, 2.6, "The museum, which was closed for two years, has finally reopened.", "What happened to the museum?", ["It opened again", "It closed", "It moved", "It was sold"], 0, [O, O, O])
dictate(B1, M1, None, 2.0, "The letter was sent last week.", ["was", "sent"])
dictate(B1, M1, None, 2.4, "She told me she had lost her keys.", ["had", "lost"])
gap(B1, M1, None, 1.9, "I've lived here ___ ten years.", ["for"], [("since", O), ("during", O)], verb=False)
mcq(B1, M1, None, 1.8, "It's the first time I ___ snow.", ["have seen", "see", "saw", "am seeing"], 0, ["L1.PERFECT_PAST", "L1.PERFECT_PAST", V])
mcq(B1, M1, None, 2.8, "I wish I ___ speak French.", ["could", "can", "will", "would can"], 0, [V, V, V])
gap(B1, M1, None, 2.9, "The children were allowed ___ (stay) up late.", ["to stay"], [("stay", "L1.VERB_PATTERN"), ("staying", "L1.VERB_PATTERN")])
mcq(B1, M1, None, 2.9, "Hardly ___ the house when it started to rain.", ["had we left", "we had left", "we left", "did we leave"], 0, [Q, V, V])

# Kesim noktası (A2|B1) çevresinde daha bilgilendirici yazılı maddeler
gap("A2", "g.present_perfect", "L1.PERFECT_PAST", 1.2, "I have ___ (know) her for five years.", ["known"], [("knew", "L1.PERFECT_PAST"), ("knowed", V)])
gap("A2", "g.comparatives", None, 1.1, "My new phone is ___ (good) than my old one.", ["better"], [("gooder", V), ("more good", V)])
gap("A2", "g.past_simple_irregular", V, 1.0, "She ___ (teach) English in Spain last year.", ["taught"], [("teached", V), ("teach", V)])
gap("A2", "g.verb_patterns", "L1.VERB_PATTERN", 1.2, "They decided ___ (take) the bus.", ["to take"], [("take", "L1.VERB_PATTERN"), ("taking", "L1.VERB_PATTERN")])
gap(B1, M1, None, 1.7, "While I ___ (walk) home, it started to rain.", ["was walking"], [("walked", V), ("am walking", V)])
gap(B1, M1, None, 1.8, "If it ___ (rain) tomorrow, the match will be cancelled.", ["rains"], [("will rain", V), ("rain", "L1.3SG_S")])
gap(B1, M1, None, 1.9, "This song ___ (write) by a teenager in 1985.", ["was written"], [("wrote", V), ("was wrote", V)])
gap(B1, M1, None, 2.0, "We ___ (not / finish) the project yet.", ["haven't finished", "have not finished"], [("didn't finish", "L1.PERFECT_PAST"), ("don't finish", V)])
gap(B1, M1, None, 2.1, "The woman ___ car was stolen called the police.", ["whose"], [("who", O), ("which", O)], verb=False)
gap(B1, M1, None, 2.2, "If I ___ (be) you, I would apologise.", ["were", "was"], [("am", V), ("would be", V)])
gap(B1, M1, None, 2.3, "She suggested ___ (go) to the cinema.", ["going"], [("to go", "L1.VERB_PATTERN"), ("go", "L1.VERB_PATTERN")])
gap(B1, M1, None, 2.4, "By the time we arrived, the film ___ (start).", ["had started", "had already started"], [("started", "L1.PERFECT_PAST"), ("has started", "L1.PERFECT_PAST")])
gap(B1, M1, None, 2.5, "He told me that he ___ (can) not come.", ["could"], [("can", V)])
gap(B1, M1, None, 2.6, "I'm not used to ___ (get) up so early.", ["getting"], [("get", "L1.VERB_PATTERN"), ("to get", "L1.VERB_PATTERN")])

# ---------------------------------------------------------------- B2 (12) — yalnızca ölçme
B2, M2 = "B2", "m.b2"
mcq(B2, M2, None, 3.1, "If she had taken the earlier train, she ___ late.", ["wouldn't have been", "wouldn't be", "won't be", "hadn't been"], 0, [V, V, V])
mcq(B2, M2, None, 3.2, "The project is said ___ over budget.", ["to be", "being", "that it is", "be"], 0, ["L1.VERB_PATTERN", O, V])
gap(B2, M2, None, 3.3, "I'd rather you ___ (not / tell) anyone about this.", ["didn't tell", "did not tell"], [("don't tell", V), ("not tell", DO)])
mcq(B2, M2, None, 3.4, "No sooner ___ than the lights went out.", ["had he arrived", "he had arrived", "he arrived", "did he arrived"], 0, [Q, V, V])
mcq(B2, M2, None, 3.5, "She can't ___ the email; it's still in her drafts.", ["have sent", "sent", "has sent", "be sent"], 0, [V, V, V])
mcq(B2, M2, None, 3.6, "It's high time we ___ a decision.", ["made", "make", "will make", "have made"], 0, [V, V, V])
order(B2, M2, None, 3.7, ["Not", "only", "did", "he", "apologise,", "but", "he", "also", "paid."], ["Not only did he apologise, but he also paid."])
mcq(B2, M2, None, 3.8, "Had I known, I ___ differently.", ["would have acted", "would act", "acted", "had acted"], 0, [V, V, V])
gap(B2, M2, None, 3.9, "The proposal, ___ details are still unclear, was rejected.", ["whose"], [("which", O), ("who's", "GEN.SPELLING")], verb=False)
listen(B2, M2, None, 3.6, "Had the weather been better, the event wouldn't have been cancelled.", "What happened to the event?", ["It was cancelled", "It went ahead", "It moved indoors", "It was delayed"], 0, [O, O, O])
dictate(B2, M2, None, 3.9, "The results are unlikely to have been affected.", ["unlikely", "have", "been"])
mcq(B2, M2, None, 4.2, "Little ___ that his life was about to change.", ["did he know", "he knew", "he did know", "knew he"], 0, [Q, V, V])

# Sınıflama bittikten sonra sorulan tek konuşma maddesi (destekleyici kanıt; karar vermez).
speaking = {
    "id": "speak-01",
    "topic_id": "g.present_simple",
    "activity_type": "speak_answer",
    "l1_target": None,
    "payload": {
        "instruction_tr": "Soruyu sesli cevapla. Yaklaşık 20 saniye konuş; basit cümleler yeterli.",
        "prompt_en": "Tell me about your day.",
    },
    "key": {
        "model_answer_en": "I wake up at seven. I go to school by bus. I have lunch with my friends. In the evening I watch TV.",
    },
}

bank = {
    "version": "2026-11-18",
    "status": "draft_pending_pedagogy",
    "note": "TASLAK: dil modeli (Claude) tarafından yazıldı; pedagoji sahibi onaylayacak, düzenleyecek ve aynı seviyedeki maddeleri zorluğa göre sıralayacak. irt.b uzman önselidir; pilot verisiyle kalibre edilir (item_calibration). B1/B2 maddeleri yalnızca ölçme içindir, öğretilmez. Dinleme maddelerinde seslendirilen metin key.text_en'dedir.",
    "items": items,
    "speaking": speaking,
}
OUT.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
from collections import Counter
print(len(items), Counter(i["cefr"] for i in items), Counter(i["activity_type"] for i in items))
