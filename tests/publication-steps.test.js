import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationStepError } from '../src/components/publicationSteps.js';
const data=()=>({selectedMode:'venta',formData:{title:'Licuadora para repuestos',price:500000,category:'Hogar',subcategory:'Electrodomésticos',conditionScore:3,description:'El motor no enciende. El vaso está completo.',city:'Bogotá',locality:'Suba'},files:[{}],categories:[{key:'Hogar',subs:['Electrodomésticos']}]});

test('publication steps require an explicit choice and cropped photos; failed steps do not mutate the draft',()=>{
 const draft=data(),before=structuredClone(draft);
 assert.ok(publicationStepError(0,{...draft,selectedMode:null}));assert.equal(publicationStepError(0,draft),'');
 assert.ok(publicationStepError(1,{...draft,files:[]}));assert.ok(publicationStepError(1,{...draft,files:Array(5).fill({})}));assert.equal(publicationStepError(1,draft),'');
 assert.deepEqual(draft,before);
});
test('sale details enforce the exact price boundary while donations have no sale price requirement',()=>{
 const draft=data();assert.equal(publicationStepError(2,draft),'');
 for(const price of [0,-1,500001,'not a number',Infinity])assert.match(publicationStepError(2,{...draft,formData:{...draft.formData,price}}),/precio/);
 assert.equal(publicationStepError(2,{...draft,selectedMode:'donacion',formData:{...draft.formData,price:''}}),'');
 for(const field of ['title','description','subcategory'])assert.ok(publicationStepError(2,{...draft,formData:{...draft.formData,[field]:''}}));
 assert.match(publicationStepError(2,{...draft,formData:{...draft.formData,description:'Escríbeme a prueba@example.com'}}),/correo/);
 assert.match(publicationStepError(2,{...draft,formData:{...draft.formData,conditionScore:11}}),/estado/);
});
test('location must belong to its city and later validation cannot skip an earlier missing photo or type',()=>{
 const draft=data();assert.equal(publicationStepError(3,draft),'');
 assert.match(publicationStepError(3,{...draft,formData:{...draft.formData,city:''}}),/ciudad/);
 assert.match(publicationStepError(3,{...draft,formData:{...draft.formData,locality:'Unknown'}}),/localidad/);
 const missing={...draft,selectedMode:null,files:[]};
 assert.equal([0,1,2,3].find(step=>publicationStepError(step,missing)),0);
 assert.equal([0,1,2,3].find(step=>publicationStepError(step,{...missing,selectedMode:'donacion'})),1);
});
