# The ad-hoc D1 reader an agent wrote at 2026-11-07T22:50:13Z, with its account, database id and key lookup made fictional.
import json,sys,urllib.request,re
sql=sys.argv[1]
assert re.match(r"^\s*SELECT\b",sql,re.I) and ";" not in sql, "SELECT only"
tok=open("/nonexistent/token").read()
url=f"https://api.cloudflare.com/client/v4/accounts/0000example/d1/database/00000000-0000-4000-8000-000000000000/raw"
r=urllib.request.Request(url,data=json.dumps({"sql":sql,"params":sys.argv[2:]}).encode(),headers={"Authorization":f"Bearer {tok}","Content-Type":"application/json"})
try:
  rep=json.load(urllib.request.urlopen(r,timeout=60))
except urllib.error.HTTPError as e:
  print("HTTP",e.code,e.read()[:500]);sys.exit(1)
for res in rep["result"]:
  cols=res["results"]["columns"]
  for row in res["results"]["rows"]: print(json.dumps(dict(zip(cols,row)))[:3000])
