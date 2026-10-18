# claude-panel

Satu halaman web untuk mengendalikan beberapa project Claude Code di VPS: terminal
per project, dev server, preview, dan file manager — termasuk dari layar HP.

Panel ini adalah lapisan tipis di atas **tmux**, bukan pengganti tmux. Semua proses
hidup di session tmux, jadi me-restart panel tidak mematikan Claude maupun dev
server; panel tinggal menyambungkan ulang.

## ⚠️ Peringatan keamanan — baca dulu

Terminal web di VPS **setara dengan memberi akses shell** kepada siapa pun yang
berhasil masuk. Konfigurasi bawaan sudah dibuat aman; jangan dilonggarkan:

- Server hanya mendengarkan di `127.0.0.1`. **Jangan** mengubahnya ke `0.0.0.0`.
- Akses dari luar lewat **Tailscale** atau **Cloudflare Access**, bukan port terbuka.
- HTTPS wajib, termasuk untuk WebSocket. Cookie sesi `HttpOnly`, `Secure`, `SameSite=Strict`.
- Login wajib untuk semua `/api`, `/ws`, dan `/preview`, dengan rate limit pada login.
- Jalankan dengan user biasa, **bukan root**.

## Fitur

- **Dashboard** — kartu per project dengan lampu status Claude dan dev server.
- **Terminal web** per jendela tmux (`claude`, `dev`, `shell`) lewat xterm.js.
- **Project baru** — buat folder, `git init`, session tmux tiga jendela, port otomatis.
- **Impor folder yang sudah ada** — daftarkan aplikasi yang sudah ada di VPS apa
  adanya, lengkap dengan pemilih folder, tebakan perintah dev dari `package.json`,
  dan port yang bisa ditentukan sendiri. Panel tidak mengubah isinya.
- **Kontrol proses** — stop/restart per jendela, daftar proses listen + tombol Kill.
- **Preview** — reverse proxy `/preview/:id/` ke dev server project.
- **File manager** — telusuri, unggah (drag & drop, dari HP), unduh file atau folder
  sebagai zip, buat folder, rename, hapus. Pengganti FTP, tanpa port tambahan.
- **Tombol pintas mobile** — Esc, Tab, panah, Ctrl+C dan Ctrl lengket, karena
  keyboard HP tidak punya tombol itu.

## Kebutuhan

Node.js 22+, `tmux`, `git`, `ss` (paket `iproute2`), dan Claude Code (`claude`) di PATH.

## Pemasangan

```bash
git clone <repo> claude-panel && cd claude-panel
npm install

# Buat password dan session secret
npm run hash-password --workspace=server
# Salin kedua baris hasilnya ke .env
cp .env.example .env && $EDITOR .env

npm run build
set -a && . ./.env && set +a
npm start
```

Panel berjalan di `http://127.0.0.1:4000`.

## Pengembangan

```bash
npm run dev:server   # API + WebSocket di :4000
npm run dev:web      # Vite di :5173, API diteruskan ke :4000
```

Untuk pengembangan lewat `http://` lokal, set `PANEL_INSECURE_COOKIES=1` agar cookie
sesi tidak memerlukan HTTPS. **Jangan dipakai di VPS.**

## Akses dari HP

Lihat [docs/tailscale.md](docs/tailscale.md). Ringkasnya: arahkan satu port HTTPS
Tailscale ke `127.0.0.1:4000` dengan `tailscale serve`, isi `PANEL_ALLOWED_ORIGINS`
dengan URL itu, lalu buka alamat `*.ts.net` dari HP.

Port panel **tidak perlu** dibuka di firewall: tailscaled meneruskan ke panel lewat
loopback, yang tidak melewati aturan port. Jangan jalankan `ufw allow 4000`.

## Menjalankan sebagai layanan

Lihat [docs/systemd.md](docs/systemd.md) untuk unit systemd user-level yang
menjalankan panel saat boot.

## Cara kerja

| Bagian | Isi |
| --- | --- |
| Session tmux | `proj-<nama>`, satu per project — sumber kebenaran status proses |
| Jendela `claude` | menjalankan `claude` |
| Jendela `dev` | menjalankan `PORT=<port> <devCommand>`; Stop = kirim Ctrl+C |
| Jendela `shell` | shell bebas untuk perintah manual |
| Metadata | satu file `projects.json`, tanpa database |
| `managed` | `true` bila folder dibuat panel; `false` bila hasil impor |

Project hasil impor hanya **didaftarkan**: panel membuka session tmux di folder itu
dan tidak pernah membuat, mengubah, atau menghapus isinya. Permintaan hapus dengan
opsi "hapus folder" ditolak untuk project impor — yang terhapus hanya
pendaftarannya di `projects.json`.

Status "Claude menunggu input" adalah **heuristik** dari isi pane (`capture-pane`),
jadi tidak akurat 100%. Terminalnya sendiri adalah acuan yang benar. Logika deteksi
dipisah di `server/src/services/status.ts` agar mudah diganti bila tampilan Claude
Code berubah.

## Catatan keamanan implementasi

- Semua perintah ke tmux dan proses lain dipanggil dengan `execFile` dan argumen
  terpisah — tidak pernah menyusun string shell dari input pengguna.
- Nama project divalidasi `^[a-z0-9-]{1,40}$`.
- Path file manager diselesaikan dengan `realpath` lalu ditolak bila keluar dari
  folder project; ini menutup `../` sekaligus symlink yang menunjuk keluar.
- Berkas unggahan di-stream ke disk dengan mode `0644` dan tidak pernah dieksekusi.
- Kill proses hanya untuk PID milik user yang sama dengan panel, dengan konfirmasi.
- Koneksi WebSocket memeriksa cookie sesi dan header `Origin`.

## Lisensi

MIT — lihat [LICENSE](LICENSE).
