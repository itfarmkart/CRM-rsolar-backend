# MySQL Proxy Server for Vercel

A lightweight TCP proxy server that forwards MySQL connections from Vercel to DigitalOcean database.

## Why This Proxy?

DigitalOcean databases require IP whitelisting, but Vercel uses dynamic IPs. This proxy:
- Runs on a server with a static IP (DigitalOcean Droplet)
- Acts as a bridge between Vercel and your DigitalOcean database
- Doesn't affect your other projects using the same database

## Setup

### 1. Deploy on DigitalOcean Droplet

Create a small droplet ($6/month):
- Ubuntu 22.04
- 1GB RAM / 1 vCPU
- Any region (preferably same as your database)

### 2. Install Node.js on Droplet

```bash
# SSH into your droplet
ssh root@your-droplet-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2
```

### 3. Upload Proxy Code

```bash
# On your local machine, from db-proxy directory
scp -r * root@your-droplet-ip:/root/mysql-proxy/
```

Or clone from Git:
```bash
# On droplet
git clone your-repo
cd your-repo/db-proxy
```

### 4. Configure Environment

```bash
# On droplet
cd /root/mysql-proxy
cp .env.example .env
nano .env
```

Update `.env`:
```
PROXY_PORT=3306
DB_HOST=your-digitalocean-db-host.db.ondigitalocean.com
DB_PORT=25060
```

### 5. Install Dependencies & Start

```bash
npm install
pm2 start server.js --name mysql-proxy
pm2 save
pm2 startup
```

### 6. Configure Firewall

```bash
# Allow MySQL port
sudo ufw allow 3306/tcp
sudo ufw enable
```

### 7. Whitelist Droplet IP in DigitalOcean

1. Go to DigitalOcean Database → Settings → Trusted Sources
2. Add your Droplet's IP address
3. Save

### 8. Update Vercel Environment Variables

In Vercel dashboard, update:
```
DB_HOST=your-droplet-ip
DB_PORT=3306
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=your-db-name
```

### 9. Test

```bash
# From your local machine
mysql -h your-droplet-ip -P 3306 -u your-db-user -p
```

## Monitoring

```bash
# View logs
pm2 logs mysql-proxy

# Check status
pm2 status

# Restart
pm2 restart mysql-proxy
```

## Security Notes

- Only expose port 3306
- Use strong database passwords
- Consider adding authentication layer if needed
- Monitor logs for suspicious activity

## Cost

- DigitalOcean Droplet: $6/month
- No additional costs
