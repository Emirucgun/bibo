import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/content/app";

export const metadata: Metadata = { title: `Gizlilik · ${APP_NAME}` };

// KVKK aydınlatma metni TASLAĞI (ROADMAP P8, M2). Son metin hukuki görüşten sonra M10'da yazılır;
// metin değişince CONSENT_VERSION da değişir. İçerik SPEC Bölüm 11 ve SCOPE günlüğüne dayanır.
const UPDATED = "15 Kasım 2026";
const TODO = "[pilot öncesi eklenecek]";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="w-fit rounded-md bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
          TASLAK · hukuki görüş bekleniyor
        </p>
        <h1 className="text-2xl font-semibold">Gizlilik ve aydınlatma metni</h1>
        <p className="text-sm text-muted-foreground">
          {APP_NAME} pilot uygulaması · Son güncelleme: {UPDATED}
        </p>
      </header>

      <Section title="Kısaca">
        <p>
          {APP_NAME}, İngilizce çalışırken yaptığın hataların kaynağını bulmaya çalışan bir pilot
          uygulamadır. Bunu yapabilmek için cevaplarını kaydeder ve yapay zekâ ile değerlendirir.
          Yalnızca buna gereken veriyi toplarız, reklam için kullanmayız, kimseye satmayız.
        </p>
      </Section>

      <Section title="Veri sorumlusu">
        <p>Veri sorumlusu: {TODO}</p>
        <p>İletişim: {TODO}</p>
      </Section>

      <Section title="Hangi verileri topluyoruz?">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Google hesabından gelen adın ve e-posta adresin.</li>
          <li>Seviye beyanın (A1 / A2 / emin değilim) ve seçtiğin ilgi alanları.</li>
          <li>
            Etkinliklere verdiğin cevaplar: yazdığın metinler, seçtiğin şıklar, konuşma
            etkinliklerinde söylediklerinin yazıya dökülmüş hâli, cevap süren.
          </li>
          <li>Bu cevaplardan türetilen puanlar, hata etiketleri ve teşhisler.</li>
          <li>Uygulama kullanımına ait basit olaylar (ör. oturum başlatma, ipucu açma).</li>
          <li>18 yaşından büyük olduğuna dair beyanın ve açık rızanın sürümü ile zamanı.</li>
        </ul>
        <p>
          Doğum tarihini toplamayız. Ses kaydını saklamayız: yalnızca yazıya dökülmek üzere işlenir.
        </p>
      </Section>

      <Section title="Neden işliyoruz?">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Sana uygun günlük oturumları hazırlamak ve cevaplarını değerlendirmek.</li>
          <li>Hatanın bir konudan mı yoksa bir beceriden mi kaynaklandığını bulmak.</li>
          <li>Pilotun işe yarayıp yaramadığını ölçmek ve uygulamayı geliştirmek.</li>
        </ul>
        <p>Hukuki sebep: açık rızan (KVKK m.5/1).</p>
      </Section>

      <Section title="Verilerin kimlere aktarılıyor?">
        <p>
          Uygulamayı çalıştırmak için aşağıdaki hizmet sağlayıcıları kullanıyoruz. Bir kısmı yurt
          dışındadır; bu nedenle verilerin yurt dışına aktarılır.
        </p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Supabase (AB): veritabanı ve giriş. Tüm kayıtların burada tutulur.</li>
          <li>Vercel (AB, Frankfurt): uygulamanın barındırılması.</li>
          <li>Google: Google hesabınla giriş.</li>
          <li>
            OpenRouter üzerinden Anthropic (ABD): yazılı cevapların ve konuşmalarının yazıya
            dökülmüş hâli, değerlendirme için.
          </li>
          <li>
            OpenRouter üzerinden Microsoft (konuşma tanıma): ses kaydın, yalnızca yazıya dökmek için.
            İşlemenin yapıldığı bölge: {TODO}
          </li>
          <li>
            Speechify (ABD): yalnızca sistemin ürettiği İngilizce alıştırma metni, seslendirme için.
            Sana ait hiçbir veri gönderilmez.
          </li>
        </ul>
        <p>
          Anthropic&apos;e gönderilen içerik, ticari koşulları gereği model eğitiminde kullanılmaz.
        </p>
      </Section>

      <Section title="Ne kadar süre saklıyoruz?">
        <p>
          Verilerin pilotun bitiminden sonra en çok 6 ay saklanır; ardından silinir ya da kimliğinle
          ilişkilendirilemeyecek hâle getirilir.
        </p>
      </Section>

      <Section title="Hakların">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Hesabını ve tüm verilerini istediğin zaman silebilirsin; bu işlem geri alınamaz.</li>
          <li>Verilerinin bir kopyasını isteyebilirsin.</li>
          <li>Rızanı istediğin zaman geri alabilirsin; bu durumda hesabın silinir.</li>
          <li>
            KVKK m.11 kapsamındaki diğer hakların (bilgi alma, düzeltme, itiraz) için yukarıdaki
            iletişim adresine yazabilirsin.
          </li>
        </ul>
      </Section>

      <Section title="Kimler kullanabilir?">
        <p>{APP_NAME} pilotu yalnızca 18 yaşından büyük, davet edilmiş kullanıcılara açıktır.</p>
      </Section>
    </main>
  );
}
