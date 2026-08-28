import json, subprocess, uuid
from datetime import UTC, datetime, timedelta
B="http://localhost:8099"; A="ak_demo_bootstrap_key_000000000001"
def call(m,p,t,b=None):
    c=["curl","-s","-w","\n%{http_code}","-X",m,B+p,"-H",f"Authorization: Bearer {t}","-H","Content-Type: application/json"]
    if b is not None: c+=["-d",json.dumps(b)]
    o=subprocess.run(c,capture_output=True,text=True).stdout; raw,code=o.rsplit("\n",1)
    return int(code), json.loads(raw)
pol=call("GET","/v1/policies",A)[1][0]["id"]
_,rt=call("POST","/v1/registration-tokens",A,{"name":"cap","policy_id":pol,
    "expires_at":(datetime.now(UTC)+timedelta(days=30)).isoformat()})
RTOK=rt["token"]; IID=str(uuid.uuid4())
META={"device_name":"l","user_name":"j","user_email":"j@e.com","browser":"C","os":"m","extension_version":"1"}
fx={}
c,e=call("POST","/v1/devices/enrol",RTOK,{"installation_id":IID,**META}); fx["enrol_pending"]={"status":c,"body":e}
d=e["result"]; DEV,DR,CONF=d["device_id"],d["refresh_token"]["token"],d["confirmation_code"]
call("POST",f"/v1/devices/{DEV}/approve",A,{"confirmation_code":CONF})
c,r=call("POST",f"/v1/devices/{DEV}/refresh",DR,{}); fx["refresh_ok"]={"status":c,"body":r}
call("PATCH",f"/v1/devices/{DEV}",A,{"status":"revoked"})
c,r=call("POST",f"/v1/devices/{DEV}/refresh",DR,{}); fx["refresh_revoked"]={"status":c,"body":r}
c,e=call("POST","/v1/devices/enrol",RTOK,{"installation_id":IID,**META}); fx["enrol_tombstoned"]={"status":c,"body":e}
json.dump(fx, open("/tmp/server-fixtures.json","w"), indent=1)
print("  captured:", ", ".join(fx))
