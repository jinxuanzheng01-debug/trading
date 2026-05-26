#!/usr/bin/env python3
"""
Simple Redis Web Dashboard
Lightweight web interface to view Redis data
"""
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from redis.asyncio import Redis
import json
from datetime import datetime
import os

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

app = FastAPI(title="Redis Dashboard")
redis = Redis.from_url(REDIS_URL, decoding="utf-8")

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Redis Dashboard</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
            .container { max-width: 1200px; margin: 0 auto; }
            h1 { color: #38bdf8; margin-bottom: 20px; }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
            .stat-card { background: #1e293b; padding: 20px; border-radius: 8px; border: 1px solid #334155; }
            .stat-label { color: #94a3b8; font-size: 14px; margin-bottom: 5px; }
            .stat-value { font-size: 28px; font-weight: bold; color: #38bdf8; }
            .section { background: #1e293b; padding: 20px; border-radius: 8px; border: 1px solid #334155; margin-bottom: 20px; }
            .section h2 { color: #38bdf8; margin-bottom: 15px; font-size: 18px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; padding: 12px; border-bottom: 1px solid #334155; }
            th { color: #94a3b8; font-weight: 500; font-size: 14px; }
            td { font-family: monospace; font-size: 13px; }
            tr:hover { background: #0f172a; }
            .key-actions { display: flex; gap: 10px; }
            button { background: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
            button:hover { background: #2563eb; }
            button.danger { background: #ef4444; }
            button.danger:hover { background: #dc2626; }
            input { background: #0f172a; border: 1px solid #334155; color: #e2e8f0; padding: 8px 12px; border-radius: 4px; width: 300px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 Redis Dashboard</h1>

            <div class="stats">
                <div class="stat-card">
                    <div class="stat-label">Keys</div>
                    <div class="stat-value" id="keyCount">-</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Memory Used</div>
                    <div class="stat-value" id="memory">-</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Connected Clients</div>
                    <div class="stat-value" id="clients">-</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Uptime</div>
                    <div class="stat-value" id="uptime">-</div>
                </div>
            </div>

            <div class="section">
                <h2>🔑 Search Keys</h2>
                <input type="text" id="searchInput" placeholder="Search keys (e.g., user:*, quote:*)" onkeyup="searchKeys(event)">
                <div id="searchResults" style="margin-top: 15px;"></div>
            </div>

            <div class="section">
                <h2>📊 All Keys</h2>
                <div id="keysList"></div>
            </div>
        </div>

        <script>
            async function loadStats() {
                const res = await fetch('/api/stats');
                const data = await res.json();
                document.getElementById('keyCount').textContent = data.key_count || 0;
                document.getElementById('memory').textContent = data.used_memory_human || '-';
                document.getElementById('clients').textContent = data.connected_clients || 0;
                document.getElementById('uptime').textContent = data.uptime_in_days || '-';
            }

            async function loadKeys() {
                const res = await fetch('/api/keys');
                const data = await res.json();
                displayKeys(data.keys);
            }

            function displayKeys(keys) {
                const container = document.getElementById('keysList');
                if (keys.length === 0) {
                    container.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">No keys found</p>';
                    return;
                }

                let html = '<table><thead><tr><th>Key</th><th>Type</th><th>TTL</th><th>Actions</th></tr></thead><tbody>';
                keys.forEach(key => {
                    html += '<tr>';
                    html += `<td>${key.key}</td>`;
                    html += `<td>${key.type || '-'}</td>`;
                    html += `<td>${key.ttl || '-'}</td>`;
                    html += '<td class="key-actions">';
                    html += `<button onclick="viewKey('${key.key}')">View</button>`;
                    html += `<button class="danger" onclick="deleteKey('${key.key}')">Delete</button>`;
                    html += '</td>';
                    html += '</tr>';
                });
                html += '</tbody></table>';
                container.innerHTML = html;
            }

            async function searchKeys(event) {
                if (event.key === 'Enter') {
                    const pattern = document.getElementById('searchInput').value;
                    const res = await fetch(`/api/keys?pattern=${encodeURIComponent(pattern)}`);
                    const data = await res.json();
                    displayKeys(data.keys);
                }
            }

            async function viewKey(key) {
                const res = await fetch(`/api/key/${encodeURIComponent(key)}`);
                const data = await res.json();
                alert(`Key: ${key}\\nType: ${data.type}\\nValue: ${JSON.stringify(data.value, null, 2)}`);
            }

            async function deleteKey(key) {
                if (confirm(`Delete key "${key}"?`)) {
                    await fetch(`/api/key/${encodeURIComponent(key)}`, { method: 'DELETE' });
                    loadKeys();
                    loadStats();
                }
            }

            loadStats();
            loadKeys();
            setInterval(() => { loadStats(); loadKeys(); }, 30000);
        </script>
    </body>
    </html>
    """

@app.get("/api/stats")
async def get_stats():
    info = await redis.info()
    dbsize = await redis.dbsize()

    # Parse info
    stats = {}
    for line in info.split('\r\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            stats[key] = value

    return JSONResponse({
        key_count: dbsize,
        used_memory_human: stats.get('used_memory_human'),
        connected_clients: stats.get('connected_clients'),
        uptime_in_days: stats.get('uptime_in_days'),
    })

@app.get("/api/keys")
async def get_keys(pattern: str = "*"):
    keys = []
    async for key in redis.scan_iter(match=pattern, count=100):
        ttl = await redis.ttl(key)
        key_type = await redis.type(key)
        keys.append({
            "key": key,
            "ttl": ttl if ttl > -1 else None,
            "type": key_type
        })
    return JSONResponse({"keys": keys})

@app.get("/api/key/{key:path}")
async def get_key(key: str):
    key_type = await redis.type(key)
    value = None

    if key_type == "string":
        value = await redis.get(key)
    elif key_type == "hash":
        value = await redis.hgetall(key)
    elif key_type == "list":
        value = await redis.lrange(key, 0, -1)
    elif key_type == "set":
        value = await redis.smembers(key)
    elif key_type == "zset":
        value = await redis.zrange(key, 0, -1, withscores=True)

    return JSONResponse({"key": key, "type": key_type, "value": value})

@app.delete("/api/key/{key:path}")
async def delete_key(key: str):
    await redis.delete(key)
    return JSONResponse({"success": True})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9000)
