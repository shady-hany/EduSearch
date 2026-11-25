import json, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from retrieval import read_documents, positional_index, build_model, search, phrase_matches

EXPECTED = [
 ('online learning', [('d1',1.0000),('d5',.4476),('d2',.4226),('d9',.1939)]),
 ('student assessment', [('d3',.4226),('d5',.3051),('d8',.2731)]),
 ('online learning AND student assessment',[('d5',.5322)]),
 ('online learning AND NOT student assessment',[('d1',1.0000),('d2',.4226),('d9',.1939)])]

class RetrievalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.docs=read_documents(ROOT/'dataset'); cls.model=build_model(cls.docs,positional_index(cls.docs)); cls.ref=json.loads((ROOT/'tests/reference.json').read_text())
    def test_collection(self):
        self.assertEqual(len(self.docs),10); self.assertEqual(len(self.model['terms']),28)
        self.assertEqual(sum(d['wordCount'] for d in self.model['documents']),73)
    def test_full_reference_index(self):
        self.assertEqual(self.model['index'],self.ref['index'])
    def test_full_reference_matrices(self):
        for k,rows in self.ref.items():
            if k=='index': continue
            for t,vs in rows.items():
                actual=[self.model['df'][t],self.model['idf'][t]] if k=='dfidf' else [self.model['lengths'][int(t[1:])-1]] if k=='lengths' else self.model[k][t]
                self.assertEqual(len(vs),len(actual))
                for a,b in zip(actual,vs): self.assertAlmostEqual(a,b,places=4,msg=f'{k} {t}')
    def test_rankings(self):
        for q,expected in EXPECTED:
            with self.subTest(q=q):
                actual=search(self.model,q)['results']; self.assertEqual([(r['id'],round(r['score'],4)) for r in actual],expected)
    def test_phrase_positions(self):
        self.assertEqual(phrase_matches(self.model['index'],'online learning'),{'d1':[1],'d2':[1],'d5':[1,8],'d9':[1]})
        self.assertEqual(phrase_matches(self.model['index'],'student assessment'),{'d3':[1],'d5':[3],'d8':[1,3]})
    def test_exact_not_bag_of_words(self):
        self.assertEqual(search(self.model,'learning online')['results'],[])
        self.assertEqual(search(self.model,'student assessment')['results'][0]['id'],'d3')
    def test_no_match_and_invalid(self):
        self.assertEqual(search(self.model,'unknown')['results'],[])
        for q in ['','online learning AND','online learning OR','online learning NOT']:
            with self.assertRaises(ValueError):search(self.model,q)
    def test_operator_case_sensitivity(self):
        normal_and = search(self.model, 'online learning and student assessment')
        self.assertEqual(normal_and['mode'], 'PHRASE')
        self.assertEqual(normal_and['phrases'], ['online learning and student assessment'])
        caps_and = search(self.model, 'online learning AND student assessment')
        self.assertEqual(caps_and['mode'], 'AND')
        self.assertEqual(caps_and['phrases'], ['online learning', 'student assessment'])
        caps_or = search(self.model, 'online learning OR student assessment')
        self.assertEqual(caps_or['mode'], 'OR')
        self.assertEqual(caps_or['phrases'], ['online learning', 'student assessment'])
        self.assertEqual(len(caps_or['results']), 6)
        caps_xor = search(self.model, 'online learning XOR student assessment')
        self.assertEqual(caps_xor['mode'], 'XOR')
        self.assertEqual([r['id'] for r in caps_xor['results']], ['d1','d2','d3','d8','d9'])
        caps_xnor = search(self.model, 'online learning XNOR student assessment')
        self.assertEqual(caps_xnor['mode'], 'XNOR')
        self.assertEqual([r['id'] for r in caps_xnor['results']], ['d5','d10','d4','d7','d6'])
        normal_or = search(self.model, 'online learning or student assessment')
        self.assertEqual(normal_or['mode'], 'PHRASE')
        caps_not = search(self.model, 'online learning NOT student assessment')
        self.assertEqual(caps_not['mode'], 'NOT')
        self.assertEqual([r['id'] for r in caps_not['results']], ['d1','d2','d9'])
        normal_not = search(self.model, 'online learning not student assessment')
        self.assertEqual(normal_not['mode'], 'PHRASE')
        normal_and_not = search(self.model, 'online learning and not student assessment')
        self.assertEqual(normal_and_not['mode'], 'PHRASE')
        caps_and_not = search(self.model, 'online learning AND NOT student assessment')
        self.assertEqual(caps_and_not['mode'], 'NOT')
        self.assertEqual([r['id'] for r in caps_and_not['results']], ['d1','d2','d9'])
        res_data = search(self.model, 'research and data')
        self.assertEqual(res_data['mode'], 'PHRASE')
        self.assertEqual(res_data['results'][0]['id'], 'd8')
        mixed = search(self.model, 'research and data AND student assessment')
        self.assertEqual(mixed['mode'], 'AND')
        self.assertEqual(mixed['phrases'], ['research and data', 'student assessment'])
        self.assertEqual(mixed['results'][0]['id'], 'd8')
    def test_normalization(self):
        for i in range(len(self.docs)):
            self.assertAlmostEqual(sum(v[i]**2 for v in self.model['normalized'].values()),1.0)
    def test_export_matches_independent_pipeline(self):
        exported=json.loads((ROOT/'data/model.json').read_text()); exported.pop('engine'); self.assertEqual(exported,self.model)

if __name__=='__main__': unittest.main()
