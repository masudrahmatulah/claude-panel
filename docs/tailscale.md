# Akses panel dari HP lewat Tailscale

Tujuannya: panel bisa dibuka dari HP di mana saja, tanpa pernah membuka port ke
internet. Panel tetap hanya mendengarkan di `127.0.0.1`.

## Mengapa tidak perlu membuka port di firewall

Yang menerima koneksi dari HP adalah `tailscaled`, lalu ia meneruskannya ke panel
lewat **loopback**. Trafik loopback tidak melewati aturan port firewall, jadi
`ufw allow 4000` tidak diperlukan — dan kalau ditambahkan, panel berisiko terbuka
ke internet begitu `PANEL_HOST` suatu saat diubah. Biarkan port panel tertutup.

## 1. Pasang Tailscale di VPS dan HP

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Pasang aplikasi Tailscale di HP, login dengan akun yang sama, lalu aktifkan.
Di admin console, aktifkan **HTTPS Certificates** dan **MagicDNS**.

## 2. Arahkan satu port HTTPS Tailscale ke panel

Cek dulu port mana yang masih bebas — satu VPS sering sudah memakai `:443` untuk
layanan lain:

```bash
sudo tailscale serve status
```

Lalu pilih port yang belum terpakai (contoh di bawah `:8444`):

```bash
sudo tailscale serve --bg --https=8444 http://127.0.0.1:4000
```

Perintah ini **menambah** entri; entri serve yang sudah ada tidak terganggu.
Jangan memakai `tailscale serve reset` — itu menghapus semua entri.

`tailscale serve` juga meneruskan WebSocket, jadi terminal web ikut berjalan.

Jangan memakai `tailscale funnel` — itu membuka panel ke internet publik.

Opsional, agar seragam bila Anda sudah terbiasa menulis aturan per-antarmuka
(secara teknis redundan, karena trafik `tailscale0` sudah diterima lebih dulu):

```bash
sudo ufw allow in on tailscale0 to any port 8444 proto tcp comment 'claude-panel over Tailscale'
```

## 3. Setel origin di panel

Tambahkan di `.env` — harus sama persis dengan URL di browser, termasuk portnya —
lalu restart panel:

```
PANEL_ALLOWED_ORIGINS="https://namavps.namatailnet.ts.net:8444"
```

Tanpa ini, login dan koneksi terminal ditolak dengan `origin tidak diizinkan` (403).

## 4. Buka dari HP

Buka `https://namavps.namatailnet.ts.net:8444` di browser HP dan login. Tambahkan
ke layar utama agar terasa seperti aplikasi.

## Alamat pendek: ikat langsung ke IP Tailscale

`tailscale serve` merutekan berdasarkan **nama host**, jadi ia tidak bisa melayani
IP telanjang: permintaan dengan `Host: 100.x.y.z` dijawab 404. Agar
`http://100.x.y.z/` bekerja, panel harus mengikat IP itu sendiri:

```
PANEL_HOST=100.x.y.z
PANEL_PORT=80
PANEL_ALLOWED_ORIGINS="https://namavps.namatailnet.ts.net:8444,http://100.x.y.z"
```

Port 80 butuh unit sistem dengan `CAP_NET_BIND_SERVICE` — lihat
[systemd.md](systemd.md) bentuk B. Bila `tailscale serve` juga dipakai, arahkan
targetnya ke alamat yang sama:

```bash
sudo tailscale serve --bg --https=8444 http://100.x.y.z:80
sudo ufw allow in on tailscale0 to any port 80 proto tcp
```

Alamat ini **HTTP polos**. Di dalam tailnet jalurnya tetap terenkripsi WireGuard,
tapi cookie sesi tidak mendapat atribut `Secure` pada jalur itu. Panel menetapkan
`Secure` per permintaan, jadi akses lewat HTTPS tetap terlindungi penuh walau
alamat IP juga aktif. Untuk pekerjaan sensitif, pakai alamat HTTPS.

## Mengganti nama mesin Tailscale — hati-hati

Mengganti hostname (`tailscale set --hostname=...`) **memutus semua entri
`tailscale serve`** sampai sertifikat untuk nama baru terbit: TLS gagal dengan
`tlsv1 alert internal error`, dan ini mengenai seluruh layanan di mesin itu,
bukan hanya panel. Bila tetap ingin mengganti nama, lakukan di luar jam sibuk dan
siapkan perintah `tailscale serve` untuk dibuat ulang dengan nama baru.

## Alternatif: Cloudflare Access

Jalankan `cloudflared tunnel` ke `127.0.0.1:4000`, lalu **wajib** pasang kebijakan
Cloudflare Access di depannya. Tanpa Access, panel terbuka untuk publik.

## Memeriksa bahwa port tidak terbuka

```bash
ss -tlnp | grep 4000     # harus 127.0.0.1:4000, bukan 0.0.0.0:4000
sudo ufw status | grep 4000   # seharusnya tidak ada hasil
```
