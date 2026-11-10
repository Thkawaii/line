# ใบรับรองสำหรับ https

ไฟล์ที่ nginx.prod.conf มองหาคือ `rewards.crt` และ `rewards.key` ในโฟลเดอร์นี้
(ไฟล์จริงไม่ได้ใส่มาใน repo เพราะเป็นข้อมูลลับ)

สร้างใบรับรองแบบ self-signed ใช้ในวงแลน อายุ 10 ปี:

```bash
openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout certs/rewards.key -out certs/rewards.crt \
  -subj "/CN=rewards" \
  -addext "subjectAltName=IP:192.168.1.50,DNS:localhost"
```

เปลี่ยน `192.168.1.50` เป็น IP จริงของเครื่อง server

บน Windows ที่ไม่มี openssl ใช้ PowerShell แทนได้:

```powershell
$cert = New-SelfSignedCertificate -DnsName "192.168.1.50","localhost" `
  -CertStoreLocation "cert:\LocalMachine\My" -NotAfter (Get-Date).AddYears(10)
```
แล้ว export เป็น .crt และ .key ด้วย openssl หรือเครื่องมือที่ถนัด

ใบรับรองแบบ self-signed เบราว์เซอร์จะขึ้นคำเตือนครั้งแรก กด "ไปต่อ" ได้
ถ้าไม่อยากให้ขึ้นคำเตือน ให้ติดตั้ง .crt เข้า Trusted Root ของเครื่องผู้ใช้
