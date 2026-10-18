# Menjalankan claude-panel sebagai layanan systemd

Ada dua bentuk: **unit user** (panel di port tinggi, mis. 4000) dan **unit sistem**
(panel mengikat port istimewa seperti 80). Pilih salah satu — jangan keduanya aktif,
karena akan berebut port.

Unit ini berjalan sebagai **user biasa**, bukan root.

## 1. Buat unit

`~/.config/systemd/user/claude-panel.service`:

```ini
[Unit]
Description=claude-panel
After=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/claude-panel
EnvironmentFile=%h/claude-panel/.env
ExecStart=/usr/bin/node %h/claude-panel/server/dist/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
```

`EnvironmentFile` membaca `.env` sebagai pasangan `KUNCI=nilai`. systemd
melepas tanda kutip ganda dengan benar, jadi nilai berspasi seperti
`PANEL_DEFAULT_DEV_COMMAND="npm run dev"` aman — dan memang **harus** dikutip
agar berkas yang sama tetap bisa dibaca dengan `. ./.env` di bash.

Bila Node dipasang lewat **nvm**, `/usr/bin/node` tidak ada. Pakai path absolut
hasil `readlink -f $(which node)`, misalnya
`%h/.nvm/versions/node/v22.23.2/bin/node`. Ingat memperbarui baris ini setiap
kali versi Node ditingkatkan.

## 2. Aktifkan

```bash
systemctl --user daemon-reload
systemctl --user enable --now claude-panel
systemctl --user status claude-panel
journalctl --user -u claude-panel -f
```

Perintah `systemctl --user` butuh bus milik user. Dari sesi SSH non-login
(misalnya skrip), set dulu:

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus
```

## 3. Tetap hidup setelah logout

```bash
sudo loginctl enable-linger $USER
```

## Catatan

- Session tmux milik project **tidak** dikelola unit ini. Me-restart panel tidak
  mematikan Claude atau dev server; itu memang disengaja.
- Jaga `.env` tetap privat: `chmod 600 ~/claude-panel/.env`.


## Bentuk B: unit sistem untuk port 80

Diperlukan hanya bila panel mengikat port di bawah 1024, misalnya agar dapat
diakses sebagai `http://<ip-tailscale>/` tanpa menulis nomor port.

`/etc/systemd/system/claude-panel.service`:

```ini
[Unit]
Description=claude-panel
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=NAMAUSER
Group=NAMAUSER
WorkingDirectory=/home/NAMAUSER/claude-panel
EnvironmentFile=/home/NAMAUSER/claude-panel/.env
ExecStart=/path/absolut/ke/node /home/NAMAUSER/claude-panel/server/dist/index.js
# Port 80 adalah port istimewa; beri hanya kemampuan bind, bukan hak root penuh.
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now claude-panel
sudo systemctl status claude-panel
journalctl -u claude-panel -f
```

Panel tetap berjalan sebagai user biasa; `AmbientCapabilities` hanya memberi hak
mengikat port istimewa, bukan root.

`After=tailscaled.service` penting bila `PANEL_HOST` berisi IP Tailscale: alamat
itu baru ada setelah tailscaled siap.
