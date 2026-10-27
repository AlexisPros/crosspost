# Crosspost

Aplikacja webowa do publikowania postów tekstowych na X i LinkedIn jednym kliknięciem.

Stack: Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS 4, PostgreSQL + Prisma 7, argon2.

## Funkcje

- **Logowanie** e-mail + hasło. Konto można założyć tylko z jednorazowym **kodem zaproszenia** od administratora.
- **Połączenia**: podłączanie kont X i LinkedIn przez OAuth 2.0, status i data ważności tokenu, odłączanie.
- **Nowy post**: pole tekstowe z licznikami znaków dla X (280) i LinkedIn (3000), podświetlenie fragmentu, który nie zmieści się na X, wybór platform, szkic zapisywany w przeglądarce.
- **Publikacja** jednym przyciskiem, równolegle na wybrane platformy.
- **Historia**: wszystkie posty z wynikiem na każdej platformie, linkiem do posta, pełną odpowiedzią API i przyciskiem „Ponów” dla nieudanych publikacji.
- **Konto**: zmiana hasła, lista aktywnych sesji, wylogowanie z pozostałych urządzeń.
- **Zaproszenia** (administrator): generowanie i unieważnianie kodów.

Interfejs jest po polsku. Wdrożenie na serwer nie zostało jeszcze wykonane, aplikacja działa lokalnie.

## Uruchomienie w Dockerze (zalecane)

Baza i aplikacja działają w kontenerach (`docker-compose.yml`), więc na komputerze potrzebny jest tylko Docker: [Docker Desktop](https://www.docker.com/products/docker-desktop/) albo lżejszy [OrbStack](https://orbstack.dev) (`brew install --cask orbstack`).

### 1. Konfiguracja

```bash
cp .env.example .env
```

W `.env` uzupełnij:

- `TOKEN_ENCRYPTION_KEY`: wynik polecenia `openssl rand -base64 32`;
- klucze X i LinkedIn (sekcja [Podłączanie X i LinkedIn](#podłączanie-x-i-linkedin)). Bez nich aplikacja działa, ale nie pozwoli podłączyć danej platformy.

`DATABASE_URL` i `APP_URL` z `.env.example` są już poprawne. W kontenerze aplikacji `docker-compose.yml` podmienia adres bazy na `db` (nazwa usługi w sieci Dockera), więc ten sam `.env` działa w kontenerze i poza nim.

### 2. Start

```bash
docker compose up -d --build
```

Pierwszy start trwa kilka minut (obraz, `npm ci`). Kontener aplikacji przy każdym starcie generuje klienta Prisma, stosuje migracje i uruchamia serwer. Postęp: `docker compose logs -f app`; gotowe, gdy pojawi się `Ready`. Aplikacja: http://localhost:3000.

### 3. Pierwszy administrator

```bash
docker compose exec app npm run admin:invite -- ty@firma.pl
```

Polecenie wypisze jednorazowy kod. Otwórz http://localhost:3000/register i załóż konto z tym e-mailem i kodem. Kolejne kody tworzy administrator w zakładce **Zaproszenia**.

**Konta testowe (tylko lokalnie).** Zamiast zaproszenia można od razu utworzyć administratora i zwykłego użytkownika ze znanymi hasłami (lista w `dev-accounts.txt`):

```bash
docker compose exec app npm run db:seed-dev
```

Skrypt odmówi działania, jeśli `APP_URL` nie wskazuje na `http://localhost`.

### 4. Na co dzień

| Polecenie | Opis |
|---|---|
| `docker compose up -d` | start bazy i aplikacji |
| `docker compose down` | stop (dane zostają w wolumenie `pgdata`) |
| `docker compose logs -f app` | logi aplikacji (błędy OAuth, publikacji) |
| `docker compose exec app <polecenie>` | polecenie w kontenerze, np. `npm test` |
| `docker compose up -d --build --renew-anon-volumes` | po zmianie `package.json` |
| `docker compose down -v` | usunięcie wszystkiego razem z danymi |

Kod jest montowany z tego katalogu, więc zmiany w plikach od razu przeładowują aplikację.

### Uwagi

- `APP_URL` jest kanonicznym adresem aplikacji. Wejścia przez inny host (np. `127.0.0.1` lub `0.0.0.0`) są przekierowywane na ten adres przed logowaniem, aby ciasteczka sesji i OAuth pozostawały na tym samym hoście. Za reverse proxy ustaw poprawne `X-Forwarded-Host` i `X-Forwarded-Proto`.
- Porty 3000 i 5432 muszą być wolne. Callback OAuth jest zarejestrowany na porcie 3000.
- Nie uruchamiaj `npm run build`, gdy działa serwer deweloperski: oba używają katalogu `.next` i serwer zaczyna zwracać 404. Pomaga `docker compose restart app`.

## Uruchomienie bez Dockera

Potrzebne Node.js 20+ i PostgreSQL 15+ (np. `brew install node postgresql@17`). Można też trzymać w Dockerze tylko bazę: `docker compose up -d db`, wtedy `DATABASE_URL` z `.env.example` pasuje bez zmian. Z własnym PostgreSQL ustaw `DATABASE_URL` na swoją bazę.

```bash
npm install                                  # zależności + klient Prisma
npx prisma migrate deploy                    # tabele
npm run admin:invite -- ty@firma.pl          # kod dla pierwszego administratora
npm run dev                                  # http://localhost:3000
```

## Podłączanie X i LinkedIn

Wymagane zmienne w `.env`: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` (oraz `TOKEN_ENCRYPTION_KEY`). Bez kluczy danej platformy przycisk „Połącz” jest ukryty.

**X** ([developer.x.com](https://developer.x.com)):

- aplikacja z włączonym OAuth 2.0, typ *Web App, Automated App or Bot*, uprawnienia *Read and write*;
- Callback URI: `<APP_URL>/api/oauth/x/callback`;
- scopes: `tweet.read tweet.write users.read offline.access`;
- konto deweloperskie musi mieć **środki (kredyty) na API**. Bez nich X odrzuca publikację z błędem `402 credits depleted`.

Token dostępu jest ważny ok. 2 h i odnawia się automatycznie refresh tokenem (`src/lib/oauth/tokens.ts`).

**LinkedIn** ([linkedin.com/developers](https://www.linkedin.com/developers/apps)):

- aplikacja powiązana ze stroną firmy;
- w zakładce *Products* dodane: **Sign In with LinkedIn using OpenID Connect** i **Share on LinkedIn**. Bez nich LinkedIn zwraca `unauthorized_scope_error`, a aplikacja pokazuje odpowiedni komunikat;
- Redirect URL: `<APP_URL>/api/oauth/linkedin/callback`;
- scopes: `openid profile w_member_social`.

Posty publikowane są z profilu osobistego. Token LinkedIn jest ważny 60 dni bez refresh tokenu: aplikacja ostrzega 7 dni wcześniej, a użytkownik klika „Połącz ponownie” (zwykle bez ponownej zgody).

Tokeny są szyfrowane w bazie (AES-256-GCM, `src/lib/token-crypto.ts`). Zmiana `TOKEN_ENCRYPTION_KEY` unieważnia zapisane połączenia.

Przycisk „Połącz” otwiera autoryzację w osobnym oknie. Po powrocie okno zamyka się, a aplikacja odświeża status połączenia bez ponownego logowania. Gdy przeglądarka blokuje okna lub nie obsługuje komunikacji między nimi, działa zwykłe przekierowanie i powrót na stronę **Połączenia**. Wszystkie powroty używają `APP_URL`, nigdy wewnętrznego adresu kontenera.

## Edytor i limity znaków

Reguły są w `src/lib/post-rules.ts` i działają tak samo w przeglądarce (liczniki) i na serwerze (walidacja):

- **X: 280 znaków** liczonych według zasad X (biblioteka `twitter-text`): każdy link = 23, emoji = 2, polskie litery i cyrylica = 1. Konta X Premium (do 25 000 znaków) świadomie nie są obsługiwane.
- **LinkedIn: 3000 znaków**, liczone ostrożnie jako długość UTF-16 tekstu po escapowaniu (emoji = 2, znak zastrzeżony, np. `(`, = 2).
- Przed publikacją tekst jest normalizowany: jednolite końce linii, Unicode NFC, bez spacji na brzegach.

## Publikacja i historia

`src/lib/publish.ts`: post jest zapisywany w bazie, a następnie wysyłany równolegle na wybrane platformy. Każda próba to osobny wiersz `PostPublication` ze statusem, ID i linkiem do posta, kodem HTTP, treścią odpowiedzi (z wybranymi nagłówkami, np. `x-restli-id`, limity zapytań) i komunikatem błędu.

- **X**: `POST https://api.x.com/2/tweets`, tekst bez zmian.
- **LinkedIn**: `POST https://api.linkedin.com/rest/posts` z nagłówkiem `LinkedIn-Version` (domyślnie `202610`, zmiana przez `LINKEDIN_API_VERSION`; LinkedIn wspiera każdą wersję ok. roku, więc trzeba ją okresowo podnosić). Tekst jest escapowany według formatu *little text*, hashtagi pozostają aktywne.
- Podwójne wysłanie formularza nie tworzy dwóch postów (klucz `clientRequestId`).
- W **Historii** nieudaną publikację można ponowić; każda próba i jej odpowiedź API są widoczne. Przy braku odpowiedzi (timeout) post mógł jednak powstać, więc komunikat prosi o sprawdzenie profilu przed ponowieniem.

## Bezpieczeństwo

- Konto tylko z kodem zaproszenia. Kod jest jednorazowy, ma datę ważności, może być przypisany do e-maila i nadaje rolę (użytkownik / administrator). W bazie przechowywany jest tylko hash SHA-256 kodu.
- Hasła: argon2id.
- Sesje: losowy token w ciasteczku `httpOnly`, w bazie hash tokenu. Ważność 30 dni, wylogowanie usuwa sesję z bazy. `src/proxy.ts` przekierowuje bez ciasteczka na `/login` (szybki filtr); właściwa weryfikacja jest w `src/lib/session.ts` i wykonuje się w każdej stronie i Server Action.
- **Limit prób** (`src/lib/rate-limit.ts`): 5 nieudanych prób hasła na konto i 20 na IP w ciągu 15 minut, potem blokada do końca okna. Dotyczy logowania i zmiany hasła; komunikat jest taki sam dla istniejących i nieistniejących kont. IP pochodzi z `X-Forwarded-For`, więc za proxy (Vercel, nginx) jest wiarygodne, a bez proxy można je podrobić; limit na konto działa niezależnie od tego.
- **Konto** (`/account`): zmiana hasła kończy pozostałe sesje; lista aktywnych sesji (przeglądarka, system, IP).
- **Nagłówki** (`next.config.ts`): Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, w produkcji także HSTS. CSP jest bez nonce (nonce wymusza dynamiczne renderowanie każdej strony), więc dopuszcza `'unsafe-inline'` dla skryptów Next.js.

## Znane ograniczenia

- Brak resetu hasła przez e-mail (aplikacja nie wysyła wiadomości). Zapomniane hasło: administrator wydaje nowy kod zaproszenia na inny adres albo użytkownik zmienia hasło w zakładce **Konto**, jeśli jest zalogowany.
- Tylko tekst: bez zdjęć, podglądów linków i postów na stronę firmową LinkedIn (wymaga Community Management API i weryfikacji LinkedIn).
- Historia pokazuje 50 najnowszych postów.

## Produkcja (gdy przyjdzie czas na wdrożenie)

- `APP_URL` z `https://`; te same adresy callback dodane w panelach X i LinkedIn.
- Nowy `TOKEN_ENCRYPTION_KEY` i baza PostgreSQL na serwerze; migracje: `npx prisma migrate deploy`. `Dockerfile` w repozytorium służy do rozwoju (`next dev`), do produkcji potrzebny będzie osobny obraz z `next build`.
- Build i start: `npm run build && npm start`. Ciasteczka są wtedy oznaczane jako `Secure`, a HSTS włączony.

## Struktura

```
docker-compose.yml, Dockerfile  baza i aplikacja w kontenerach (rozwój lokalny)
prisma/schema.prisma            model danych (użytkownicy, kody, sesje, próby logowania, połączenia, posty, publikacje)
prisma/migrations/              migracje SQL
scripts/create-admin-invite.ts  kod zaproszenia dla pierwszego administratora
src/proxy.ts                    przekierowanie niezalogowanych na /login
src/lib/                        baza, sesje, hasła, limit prób, kody, szyfrowanie tokenów
src/lib/oauth/                  X i LinkedIn: autoryzacja, profil, odświeżanie tokenów, publikacja
src/lib/publish.ts              zapis posta, publikacja na platformach, ponawianie
src/lib/post-rules.ts           limity znaków, normalizacja i escapowanie tekstu
src/app/(auth)/                 logowanie, rejestracja
src/app/(app)/                  nowy post, historia, połączenia, konto, zaproszenia
src/app/api/oauth/              start i callback OAuth
```

## Komendy

| Komenda | Opis |
|---|---|
| `docker compose up -d` / `down` | start / stop bazy i aplikacji w Dockerze |
| `npm run dev` | serwer deweloperski |
| `npm run admin:invite -- [email]` | kod zaproszenia z rolą administratora |
| `npm run db:seed-dev` | konta testowe z `dev-accounts.txt` (tylko lokalnie) |
| `npx prisma migrate deploy` | zastosowanie migracji |
| `npm run db:migrate -- --name <nazwa>` | nowa migracja po zmianie schematu |
| `npm test` | testy jednostkowe |
| `npm run typecheck` | sprawdzenie typów |
| `npm run lint` | ESLint |
