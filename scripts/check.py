from pathlib import Path
import json, unittest
ROOT=Path(__file__).resolve().parents[1]
class Guardrails(unittest.TestCase):
 def test_client(self):
  c=json.loads((ROOT/'config/element.json').read_text());self.assertTrue(c['disable_guests']);self.assertEqual(c['integrations_ui_url'],'')
 def test_auth_closed(self):
  s=(ROOT/'scripts/init.py').read_text();self.assertIn("'password_config':{'enabled':False}",s);self.assertIn("'enable_registration':False",s)
 def test_no_federation_listener(self):
  s=(ROOT/'scripts/init.py').read_text();self.assertIn("'names':['client']",s);self.assertIn("'federation_domain_whitelist':[]",s)
 def test_proxy(self):
  s=(ROOT/'config/Caddyfile').read_text();self.assertIn('/_synapse/admin/*',s);self.assertIn('no-store',s)
unittest.main()
