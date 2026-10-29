import asyncio,unittest,sys,pathlib
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from policy import EncryptedOnly
class Event:
 def __init__(self,t,c,state=False):self.type=t;self.content=c;self.state=state
 def is_state(self):return self.state
class API:
 def register_third_party_rules_callbacks(self,**kw):pass
class PolicyTests(unittest.TestCase):
 def setUp(self):self.policy=EncryptedOnly({},API())
 def allowed(self,event,state={}):return asyncio.run(self.policy.check_event_allowed(event,state))[0]
 def test_clear_message_rejected(self):self.assertFalse(self.allowed(Event('m.room.message',{'body':'secret'})))
 def test_custom_clear_event_rejected(self):self.assertFalse(self.allowed(Event('bf.instruction',{'body':'secret'})))
 def test_unencrypted_room_rejected(self):self.assertFalse(self.allowed(Event('m.room.encrypted',{'algorithm':'m.megolm.v1.aes-sha2'})))
 def test_encrypted_payload(self):self.assertTrue(self.allowed(Event('m.room.encrypted',{'algorithm':'m.megolm.v1.aes-sha2'}),{('m.room.encryption',''):object()}))
 def test_public_room_rejected(self):self.assertFalse(self.allowed(Event('m.room.join_rules',{'join_rule':'public'},True)))
 def test_unknown_state_rejected(self):self.assertFalse(self.allowed(Event('bf.instruction',{'body':'secret'},True)))
 def test_encryption_downgrade_rejected(self):self.assertFalse(self.allowed(Event('m.room.encryption',{'algorithm':'none'},True)))
if __name__=='__main__':unittest.main()
