-- ÜRETİLMİŞ DOSYA, elle düzenlemeyin. Kaynak: supabase/seed/topics.csv, l1_codes.csv
-- Yeniden üret: npx tsx scripts/build-seed.ts
-- Uzak projeye: npx supabase db push --remote --include-seed (upsert; tekrar çalıştırılabilir).
-- placement_bank.json veritabanına yazılmaz; yerleştirme dosyadan okur (kalibrasyon item_calibration'da).

begin;

insert into public.topics (id, level, kind, title_tr, title_en, description_tr, l1_risk, prereqs, sort, active, irt_b, unit, value, exam_weight, confusables, goal_tags) values
  ('g.be_present', 'A1', 'grammar', 'am / is / are', 'Present of be', 'Ad ve sıfat cümlelerinde am, is, are kullanımı.', 2, '{}'::text[], 10, true, null, 1, 3, 1, array['g.present_simple']::text[], array['communication']::text[]),
  ('g.subject_pronouns', 'A1', 'grammar', 'Özne zamirleri (he / she / it)', 'Subject pronouns', 'I, you, he, she, it, we, they ve İngilizcede öznenin zorunlu olması.', 2, '{}'::text[], 20, true, null, 1, 3, 1, array['g.possessives', 'g.object_pronouns']::text[], '{}'::text[]),
  ('g.possessives', 'A1', 'grammar', 'İyelik sıfatları (my / his / her)', 'Possessive adjectives', 'my, your, his, her, its, our, their ve sahibin cinsiyetine göre seçim.', 2, array['g.subject_pronouns']::text[], 30, true, null, 2, 2, 1, array['g.subject_pronouns', 'g.object_pronouns']::text[], '{}'::text[]),
  ('g.articles_a_an', 'A1', 'grammar', 'a / an', 'Indefinite articles', 'Tekil sayılabilir isimlerden önce a ya da an kullanımı.', 2, '{}'::text[], 40, true, null, 1, 2, 1, array['g.articles_the']::text[], array['exam']::text[]),
  ('g.articles_the', 'A1', 'grammar', 'the', 'Definite article', 'the''nin belirli şeyler için kullanılması ve genel anlamda kullanılmaması.', 2, array['g.articles_a_an']::text[], 50, true, null, 4, 2, 2, array['g.articles_a_an']::text[], array['exam']::text[]),
  ('g.plurals', 'A1', 'grammar', 'Çoğul -s, sayılarla çoğul', 'Plural nouns', 'Çoğul -s / -es, düzensiz çoğullar ve sayılardan sonra çoğul isim.', 1, '{}'::text[], 60, true, null, 2, 2, 1, '{}'::text[], '{}'::text[]),
  ('g.there_is_are', 'A1', 'grammar', 'there is / there are', 'There is / there are', 'Bir şeyin var olduğunu söylemek için there is ve there are.', 1, array['g.be_present', 'g.plurals']::text[], 70, true, null, 2, 3, 1, array['g.have_has']::text[], array['communication']::text[]),
  ('g.present_simple', 'A1', 'grammar', 'Geniş zaman (present simple)', 'Present simple', 'Alışkanlıkları ve genel doğruları anlatmak için geniş zaman.', 1, array['g.subject_pronouns']::text[], 80, true, null, 3, 3, 2, array['g.present_continuous', 'g.be_present']::text[], array['communication']::text[]),
  ('g.present_simple_3sg', 'A1', 'grammar', 'Üçüncü tekil -s', 'Third person -s', 'he, she, it ile geniş zamanda fiile -s / -es eklenmesi.', 2, array['g.present_simple']::text[], 90, true, null, 3, 2, 2, '{}'::text[], array['exam']::text[]),
  ('g.do_does_q_neg', 'A1', 'grammar', 'do / does ile soru ve olumsuz', 'Questions and negatives with do / does', 'Geniş zamanda do, does, don''t ve doesn''t ile soru ve olumsuz cümle.', 2, array['g.present_simple_3sg']::text[], 100, true, null, 3, 3, 2, array['g.past_q_neg']::text[], array['exam']::text[]),
  ('g.have_has', 'A1', 'grammar', 'have / has', 'Have / has', 'Sahiplik anlatmak için have ve has, öznenin kişisine göre seçim.', 1, array['g.subject_pronouns']::text[], 110, true, null, 2, 3, 1, array['g.there_is_are']::text[], '{}'::text[]),
  ('g.can', 'A1', 'grammar', 'can (yetenek, izin)', 'Can for ability and permission', 'Yetenek ve izin için can ve can''t, ardından yalın fiil.', 0, array['g.subject_pronouns']::text[], 120, true, null, 4, 3, 1, array['g.modals_obligation']::text[], array['communication', 'work_travel']::text[]),
  ('g.present_continuous', 'A1', 'grammar', 'Şimdiki zaman (present continuous)', 'Present continuous', 'Şu anda olan şeyler için am / is / are + fiil-ing.', 2, array['g.be_present']::text[], 130, true, null, 5, 2, 2, array['g.present_simple']::text[], array['communication']::text[]),
  ('g.prep_time', 'A1', 'grammar', 'in / on / at (zaman)', 'Prepositions of time: in, on, at', 'Saat, gün, ay ve yıllarla in, on ve at seçimi.', 2, '{}'::text[], 140, true, null, 3, 2, 1, array['g.prep_place']::text[], array['work_travel']::text[]),
  ('g.prep_place', 'A1', 'grammar', 'in / on / at, under, next to (yer)', 'Prepositions of place', 'Yer bildirmek için in, on, at, under ve next to.', 2, '{}'::text[], 150, true, null, 2, 2, 1, array['g.prep_time']::text[], array['work_travel']::text[]),
  ('g.wh_questions', 'A1', 'grammar', 'Wh- soruları ve soru sırası', 'Wh- questions and word order', 'what, where, when, who ile soru ve yardımcı fiilin özneden önce gelmesi.', 2, array['g.do_does_q_neg']::text[], 160, true, null, 3, 3, 1, '{}'::text[], array['communication', 'work_travel']::text[]),
  ('g.object_pronouns', 'A1', 'grammar', 'me / him / her / them', 'Object pronouns', 'Fiilden ve edattan sonra me, you, him, her, it, us, them.', 1, array['g.subject_pronouns']::text[], 170, true, null, 4, 2, 1, array['g.subject_pronouns', 'g.possessives']::text[], '{}'::text[]),
  ('g.some_any_much_many', 'A1', 'grammar', 'some / any, much / many', 'Some / any, much / many', 'Sayılabilir ve sayılamaz isimlerle some, any, much ve many.', 1, array['g.plurals']::text[], 180, true, null, 4, 2, 1, '{}'::text[], array['work_travel']::text[]),
  ('g.adverbs_frequency', 'A1', 'grammar', 'always / usually … ve yeri', 'Adverbs of frequency', 'always, usually, sometimes, never ve cümledeki yerleri.', 1, array['g.present_simple']::text[], 190, true, null, 3, 2, 1, '{}'::text[], '{}'::text[]),
  ('g.word_order_svo', 'A1', 'grammar', 'Temel cümle sırası (özne-fiil-nesne)', 'Basic word order (SVO)', 'İngilizcede cümlenin özne, fiil, nesne sırasıyla kurulması.', 2, '{}'::text[], 200, true, null, 1, 3, 1, '{}'::text[], '{}'::text[]),
  ('g.past_be', 'A2', 'grammar', 'was / were', 'Past of be', 'Geçmişte durum anlatmak için was ve were.', 1, array['g.be_present']::text[], 210, true, null, 6, 3, 1, '{}'::text[], '{}'::text[]),
  ('g.past_simple_regular', 'A2', 'grammar', 'Geçmiş zaman, düzenli fiiller', 'Past simple: regular verbs', 'Düzenli fiillerde -ed ile geçmiş zaman.', 1, array['g.present_simple']::text[], 220, true, null, 6, 3, 2, array['g.past_simple_irregular', 'g.present_perfect']::text[], array['communication']::text[]),
  ('g.past_simple_irregular', 'A2', 'grammar', 'Geçmiş zaman, düzensiz fiiller', 'Past simple: irregular verbs', 'Sık kullanılan düzensiz fiillerin geçmiş biçimleri (go → went).', 0, array['g.past_simple_regular']::text[], 230, true, null, 6, 3, 2, array['g.past_simple_regular', 'g.present_perfect']::text[], array['communication']::text[]),
  ('g.past_q_neg', 'A2', 'grammar', 'did ile soru ve olumsuz', 'Past questions and negatives with did', 'Geçmiş zamanda did ve didn''t ile soru ve olumsuz, ardından yalın fiil.', 2, array['g.past_simple_regular', 'g.do_does_q_neg']::text[], 240, true, null, 6, 3, 2, array['g.do_does_q_neg']::text[], array['exam']::text[]),
  ('g.going_to', 'A2', 'grammar', 'be going to', 'Be going to', 'Planları ve niyetleri anlatmak için be going to.', 0, array['g.be_present']::text[], 250, true, null, 7, 3, 1, array['g.will_future']::text[], array['communication', 'work_travel']::text[]),
  ('g.will_future', 'A2', 'grammar', 'will', 'Will for the future', 'Anlık kararlar, tahminler ve sözler için will.', 0, '{}'::text[], 260, true, null, 7, 2, 1, array['g.going_to']::text[], array['communication', 'work_travel']::text[]),
  ('g.comparatives', 'A2', 'grammar', 'Karşılaştırma ve üstünlük', 'Comparatives and superlatives', '-er / more ve -est / most ile karşılaştırma ve üstünlük.', 1, array['g.be_present']::text[], 270, true, null, 8, 2, 2, '{}'::text[], array['exam', 'work_travel']::text[]),
  ('g.present_perfect', 'A2', 'grammar', 'Present perfect (ever / never / already / yet)', 'Present perfect', 'Zamanı belirtilmeyen geçmiş deneyimler için have / has + V3.', 2, array['g.past_simple_irregular', 'g.have_has']::text[], 280, true, null, 11, 2, 2, array['g.past_simple_irregular', 'g.past_simple_regular']::text[], array['exam']::text[]),
  ('g.modals_obligation', 'A2', 'grammar', 'should / must / have to', 'Should, must, have to', 'Tavsiye ve zorunluluk için should, must ve have to.', 0, array['g.can']::text[], 290, true, null, 9, 2, 1, array['g.can']::text[], array['exam', 'work_travel']::text[]),
  ('g.verb_patterns', 'A2', 'grammar', 'want to / like -ing', 'Verb patterns: to / -ing', 'want, need gibi fiillerden sonra to, like, enjoy gibi fiillerden sonra -ing.', 1, array['g.present_simple']::text[], 300, true, null, 10, 2, 1, '{}'::text[], array['exam']::text[]),
  ('p.th', 'A1', 'pron', 'th sesi (algı: think / sink)', 'The th sounds', 'th sesini t, d ve s seslerinden ayırt etmek (think / sink, this / dis).', 2, '{}'::text[], 310, true, null, 0, 1, 0, '{}'::text[], '{}'::text[]),
  ('p.w_v', 'A1', 'pron', 'w / v ayrımı (algı: wine / vine)', 'W and v sounds', 'w ve v seslerini dinlerken ayırt etmek (wine / vine).', 2, '{}'::text[], 320, true, null, 0, 1, 0, '{}'::text[], '{}'::text[]),
  ('m.b1', 'B1', 'measure', 'B1 ölçme maddeleri', 'B1 measurement items', 'Yalnızca yerleştirmede seviye üstünü ayırmak için; öğretilmez.', 1, '{}'::text[], 900, true, 2.25, 0, 1, 0, '{}'::text[], '{}'::text[]),
  ('m.b2', 'B2', 'measure', 'B2 ölçme maddeleri', 'B2 measurement items', 'Yalnızca yerleştirmede seviye üstünü ayırmak için; öğretilmez.', 1, '{}'::text[], 910, true, 3.75, 0, 1, 0, '{}'::text[], '{}'::text[])
on conflict (id) do update set
  level = excluded.level,
  kind = excluded.kind,
  title_tr = excluded.title_tr,
  title_en = excluded.title_en,
  description_tr = excluded.description_tr,
  l1_risk = excluded.l1_risk,
  prereqs = excluded.prereqs,
  sort = excluded.sort,
  active = excluded.active,
  irt_b = excluded.irt_b,
  unit = excluded.unit,
  value = excluded.value,
  exam_weight = excluded.exam_weight,
  confusables = excluded.confusables,
  goal_tags = excluded.goal_tags;

insert into public.l1_codes (code, topic_id, is_l1, name_tr, rule_tr, wrong_example, right_example) values
  ('L1.ART_OMIT', 'g.articles_a_an', true, 'Artikel atlama', 'Türkçede "bir" çoğu zaman söylenmez; İngilizcede tekil sayılabilir isim artikelsiz kalmaz.', 'I have car.', 'I have a car.'),
  ('L1.ART_THE', 'g.articles_the', true, 'the''yi fazla ya da eksik kullanma', 'Türkçede belirlilik bağlamdan anlaşılır; İngilizcede genel anlamda the kullanılmaz.', 'The life is hard.', 'Life is hard.'),
  ('L1.HE_SHE', 'g.subject_pronouns', true, 'he / she / it karışıklığı', 'Türkçede "o" cinsiyetsizdir; İngilizcede ayrılır.', 'My sister, he is a doctor.', 'My sister, she is a doctor.'),
  ('L1.HIS_HER', 'g.possessives', true, 'his / her karışıklığı', 'Türkçe iyelik eki (-ı, -i) cinsiyet taşımaz.', 'My mother loves his job.', 'My mother loves her job.'),
  ('L1.SUBJ_DROP', 'g.subject_pronouns', true, 'Özne düşürme', 'Türkçede özne fiil ekinden anlaşılır; İngilizcede özne zorunludur.', 'Is very good.', 'It is very good.'),
  ('L1.BE_OMIT', 'g.be_present', true, 'be fiilini atlama', 'Türkçede ek-fiil (-dır) çoğu zaman söylenmez.', 'She happy.', 'She is happy.'),
  ('L1.3SG_S', 'g.present_simple_3sg', true, 'Üçüncü tekil -s eksikliği', 'İngilizcede yalnızca he / she / it ile fiile -s gelir.', 'He play football.', 'He plays football.'),
  ('L1.DO_SUPPORT', 'g.do_does_q_neg', true, 'do / does / did eksikliği ya da yanlışı', 'Türkçede olumsuzluk fiile ek (-me) olarak gelir; İngilizcede yardımcı fiil gerekir.', 'She don''t like. / I not like.', 'She doesn''t like. / I don''t like.'),
  ('L1.Q_INVERSION', 'g.wh_questions', true, 'Soru yapısı (yardımcı fiil, sıra)', 'Türkçede soru -mı eki ve tonlamayla yapılır; İngilizcede sıra değişir.', 'Where you live?', 'Where do you live?'),
  ('L1.WORD_ORDER_SOV', 'g.word_order_svo', true, 'Fiili sona koyma', 'Türkçe özne-nesne-fiil, İngilizce özne-fiil-nesne dizilir.', 'I football play.', 'I play football.'),
  ('L1.PLURAL_NUM', 'g.plurals', true, 'Sayıdan sonra çoğul eksikliği', 'Türkçede sayıdan sonra çoğul eki gelmez ("iki kitap").', 'two book', 'two books'),
  ('L1.COUNT_UNCOUNT', 'g.some_any_much_many', true, 'Sayılabilir / sayılamaz karışıklığı', 'Türkçede bu ayrım dilbilgisel olarak işaretlenmez.', 'many water, informations', 'much water, information'),
  ('L1.PREP_IN_ON_AT', 'g.prep_time', true, 'in / on / at karışıklığı', 'Türkçedeki tek -de/-da eki İngilizcede üç edata ayrılır.', 'in Monday', 'on Monday'),
  ('L1.THERE_HAVE', 'g.there_is_are', true, '"var" yapısı', 'Türkçedeki "var", İngilizcede there is ya da have ile karşılanır.', 'In my city has a park.', 'There is a park in my city.'),
  ('L1.SIMPLE_CONT', 'g.present_simple', true, 'Geniş / şimdiki zaman karışıklığı', 'Türkçe -yor hem şu ana hem alışkanlığa kullanılır.', 'I am going to school every day.', 'I go to school every day.'),
  ('L1.PERFECT_PAST', 'g.present_perfect', true, 'Present perfect / past simple karışıklığı', 'Türkçe -di iki anlamı da karşılar; belirli geçmiş zamanla present perfect kullanılmaz.', 'I have seen him yesterday.', 'I saw him yesterday.'),
  ('L1.VERB_PATTERN', 'g.verb_patterns', true, 'Mastar yapısı (to / -ing)', 'Türkçede mastar eki fiile bağlıdır (gitmek); İngilizcede ayrı "to" gerekir.', 'I want go.', 'I want to go.'),
  ('L1.LITERAL', null, true, 'Kelime kelime çeviri ve kalıp', 'Türkçe kalıbı birebir çevirmek İngilizcede yanlış yapı üretir.', 'I am agree. / make sport', 'I agree. / do sport'),
  ('L1.TH_SOUND', 'p.th', true, 'th sesi', 'Türkçede th sesi yoktur; t, d, s ile karışır.', 'sink (think yerine)', 'think'),
  ('L1.W_V', 'p.w_v', true, 'w / v ayrımı', 'Türkçede w sesi yoktur; v ile karışır.', 'vine (wine yerine)', 'wine'),
  ('GEN.VERB_FORM', null, false, 'Yanlış fiil biçimi', 'Türkçe kaynaklı değil.', 'He goed.', 'He went.'),
  ('GEN.SPELLING', null, false, 'Yazım', null, 'becuase', 'because'),
  ('GEN.VOCAB', null, false, 'Yanlış kelime seçimi', null, null, null),
  ('GEN.OTHER', null, false, 'Diğer', null, null, null)
on conflict (code) do update set
  topic_id = excluded.topic_id,
  is_l1 = excluded.is_l1,
  name_tr = excluded.name_tr,
  rule_tr = excluded.rule_tr,
  wrong_example = excluded.wrong_example,
  right_example = excluded.right_example;

commit;
