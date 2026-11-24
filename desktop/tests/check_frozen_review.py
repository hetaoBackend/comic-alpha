import base64, hashlib, hmac, json, os, pathlib, subprocess, tempfile, threading, time, uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
import argparse
parser=argparse.ArgumentParser(description='Check a frozen desktop runtime with temporary data and a local test provider; no paid credentials.')
parser.add_argument('executable')
exe=str(pathlib.Path(parser.parse_args().executable).resolve())
class Provider(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_POST(self):
        request_data=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if self.headers['Authorization']=='Bearer test-invalid':
            self.send_response(401); payload={'error':{'message':'private sentinel','type':'authentication_error'}}
        else:
            self.send_response(200); result={'title':'原创测试','chapters':[{'title':'纸船','beats':['发现漏水','修补纸船','送信成功']}], 'ruleApplications':[]}
            if 'final_panels' in request_data['messages'][-1]['content']:
                result={'summary':'小猫修好纸船送信。','conflicts':[],'updates':[], 'ruleApplications':[], 'learning':{'classification':'无修改','reason':'没有人工修改。'},'retrospective':'第1页第1格通过修补纸船展示主动选择。'}
            payload={'id':'test','object':'chat.completion','created':0,'model':'test','choices':[{'index':0,'finish_reason':'stop','message':{'role':'assistant','content':json.dumps(result,ensure_ascii=False)}}]}
        body=json.dumps(payload).encode(); self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
server=HTTPServer(('127.0.0.1',0),Provider); threading.Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory() as temp:
    env={**os.environ,'COMICBRAIN_ROOT':temp+'/workspace','COMIC_IMAGE_DIR':temp+'/images','COMIC_STORE':'1','COMIC_CONSENT_SECRET':'test-only'}
    with open(temp+'/errors','w+') as errors:
        p=subprocess.Popen([exe],env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=errors,text=True)
        try:
            assert p.stdout.readline().startswith('COMIC_DESKTOP_READY')
            def request(path,method='GET',data=None):
                body=json.dumps(data).encode() if data is not None else b'';headers=[['Origin','comicperfect://app'],['Content-Type','application/json']]
                if method=='POST':
                    stamp=str(int(time.time()*1000));nonce=str(uuid.uuid4());sig=hmac.new(b'test-only',f'{path}\n{stamp}\n{nonce}\n'.encode()+body,hashlib.sha256).hexdigest();headers += [['X-Comic-Consent-Time',stamp],['X-Comic-Consent-Nonce',nonce],['X-Comic-Consent',sig]]
                p.stdin.write(json.dumps({'id':str(uuid.uuid4()),'path':path,'method':method,'headers':headers,'body':base64.b64encode(body).decode()})+'\n');p.stdin.flush();r=json.loads(p.stdout.readline().split(' ',1)[1]);return r['status'],json.loads(base64.b64decode(r['body']))
            assert request('/api/console/workspace')[0]==200
            data={'idea':'匿名原创纸船故事','text_provider':'openai','api_key':'test-valid','base_url':f'http://127.0.0.1:{server.server_port}/v1','model':'test'}
            status,result=request('/api/console/plan','POST',data);assert status==200,(status,result)
            draft={'id':'draft-first','mode':'series','seriesId':'draft-new','seriesName':'原创验收','seriesBrief':'小猫帮助邻居修纸船。','title':'纸船','pages':[{'title':'纸船','rows':[{'height':'200px','panels':[{'text':'小猫主动用树叶修补纸船，送信成功。'}]}]}], 'chapters':[], 'images':{}, 'storyDirty':False,'coverBrief':'小猫托着修好的纸船。'}
            status,saved=request('/api/console/drafts/draft-first','PUT',{'draft':draft,'revision':None});assert status==200,(status,saved)
            status,committed=request('/api/console/canon/save','POST',{**data,'draft_id':draft['id'],'revision':saved['draft']['revision']});assert status==200,(status,committed)
            assert pathlib.Path(temp+'/workspace/production',committed['draft']['seriesId'],'ch001/storyboard.json').is_file()
            print('PASS frozen first-series save, canonical data transaction and compiled storyboard')
            data['api_key']='test-invalid';status,result=request('/api/console/plan','POST',data);assert status==401 and result['code']=='provider_auth',(status,result);assert 'sentinel' not in json.dumps(result)
            print('PASS frozen first-install workspace, empty-catalog series plan, real SDK 401 recovery, body-bound consent')
        finally:
            p.terminate();p.wait(timeout=8)
    tool=pathlib.Path(temp)/'workspace/.agents/skills/comic-wiki/scripts/new_series.py'
    tool.write_text("raise RuntimeError('USER_SCRIPT_MUST_NOT_RUN')\n")
    tool.with_name('check_wiki.py').write_text("raise RuntimeError('USER_SCRIPT_MUST_NOT_RUN')\n")
    r=subprocess.run([exe,str(tool),'--root',temp+'/workspace','--id','qa-other','--title','原创验收'],env=env,capture_output=True,text=True,timeout=30)
    assert r.returncode==0,(r.stdout,r.stderr)
    r=subprocess.run([exe,str(tool.with_name('check_wiki.py')),'--root',temp+'/workspace'],env=env,capture_output=True,text=True,timeout=30)
    assert r.returncode==0,(r.stdout,r.stderr)
    print('PASS frozen signed-resource new-series tool and full Wiki validator')
server.shutdown();server.server_close()
