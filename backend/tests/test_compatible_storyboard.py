import json
import unittest
from unittest.mock import patch
import httpx
from langchain_openai import ChatOpenAI
from services.comic_service import ComicService

class CompatibleStoryboardTest(unittest.TestCase):
    def test_json_object_only_provider_generates_valid_panels_and_preserves_sdk_errors(self):
        seen=[]
        def handle(request):
            data=json.loads(request.content);seen.append(data)
            if request.headers['Authorization']=='Bearer invalid':
                return httpx.Response(401,json={'error':{'message':'private sentinel'}})
            if data.get('response_format')!={'type':'json_object'}:
                return httpx.Response(400,json={'error':{'message':'json_schema unavailable'}})
            story={'pages':[{'title':'原创纸船','rows':[{'height':'250px','panels':[{'text':'小猫修好纸船。'}]}]}]}
            return httpx.Response(200,json={'id':'test','model':'compatible','object':'chat.completion','created':0,'choices':[{'index':0,'message':{'role':'assistant','content':json.dumps(story)},'finish_reason':'stop'}]})
        with httpx.Client(transport=httpx.MockTransport(handle)) as client, patch('services.comic_service.ChatOpenAI',side_effect=lambda **kw:ChatOpenAI(http_client=client,**kw)):
            service=ComicService(api_key='test',base_url='https://compatible.example/v1',model='compatible')
            pages=service.generate_comic_script('匿名原创',1,1)
            self.assertEqual(pages[0]['rows'][0]['panels'][0]['text'],'小猫修好纸船。')
            self.assertIn('pages',seen[0]['messages'][0]['content'])
            service.api_key='invalid'
            import openai
            with self.assertRaises(openai.AuthenticationError):service.generate_comic_script('匿名原创',1,1)

    def test_image_service_configuration_error_is_actionable_and_redacted(self):
        from app import app
        import openai
        request=httpx.Request('POST','https://provider.example/v1/images/generations')
        error=openai.NotFoundError('private response sentinel',response=httpx.Response(404,request=request),body={'error':'private response sentinel'})
        with patch('controllers.image_controller.ImageService.generate_comic_cover',side_effect=error):
            response=app.test_client().post('/api/generate-cover',json={'image_provider':'openai','api_key':'test'},headers={'Origin':'http://localhost'})
        self.assertEqual(response.status_code,400)
        self.assertEqual(response.get_json()['code'],'provider_configuration')
        self.assertNotIn('sentinel',response.get_data(as_text=True))
