#!/bin/bash

echo "=== 1. PM2 Status ==="
ssh root@64.23.131.24 "pm2 status"

echo ""
echo "=== 2. Server Output Logs (last 50 lines) ==="
ssh root@64.23.131.24 "tail -50 /root/.pm2/logs/paper-out.log"

echo ""
echo "=== 3. Server Error Logs (last 30 lines) ==="
ssh root@64.23.131.24 "tail -30 /root/.pm2/logs/paper-error.log"

echo ""
echo "=== 4. Test Simple API Endpoint ==="
curl -s "http://64.23.131.24:5000/api/data?sheet=Season%204" | head -c 500

echo ""
echo ""
echo "=== 5. Test Archive Endpoint ==="
curl -s --max-time 180 -X POST -H "Content-Type: application/json" \
  -d '{"sheet": "Season 4", "week": 20, "force": true}' \
  "http://64.23.131.24:5000/api/archive-week"

echo ""
echo ""
echo "=== 6. Check Logs After Archive ==="
ssh root@64.23.131.24 "tail -30 /root/.pm2/logs/paper-out.log | grep -i archiv" || echo "No archive-related logs found"

echo ""
echo "=== Done ==="
