'use strict';

const PIN_HASH = '001dc19b607d4f8bd3459a8c619eed7add4daaafb261beefe78f1fc18c74d5f1';
async function verifyPin(pin){
  const data=new TextEncoder().encode('atria-v1:'+String(pin));
  const digest=await crypto.subtle.digest('SHA-256',data);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')===PIN_HASH;
}
const DB_NAME = 'atria-db';
const DB_VERSION = 1;
const STORES = { entries: 'entries', catalog: 'catalog', meta: 'meta' };

const state = {
  db: null,
  entries: [],
  catalog: [],
  meta: {},
  monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: null,
  currentView: 'calendar',
  mealDraft: null,
};

const DEFAULT_META = {
  theme: 'dark',
  hourFormat: '24',
  correlationWindow: 72,
  favoriteMeals: [],
  lastBackupAt: null,
};

const FOOD_CATEGORIES = ['Carbohidratos','Cereales','Proteínas','Embutidos','Verduras','Fruta','Lácteos','Legumbres','Frutos secos','Semillas','Grasas y aceites','Salsas','Condimentos','Dulces y snacks','Preparados','Otros'];

const FOOD_TAG_DEFS = [
  {key:'gluten',label:'Gluten'},
  {key:'trigo',label:'Trigo'},
  {key:'cebada',label:'Cebada'},
  {key:'centeno',label:'Centeno'},
  {key:'espelta',label:'Espelta'},
  {key:'gluten_posible',label:'Puede contener gluten'},
  {key:'trigo_posible',label:'Puede contener trigo'},
  {key:'lactosa',label:'Lactosa'},
  {key:'lactosa_posible',label:'Puede contener lactosa'},
  {key:'leche',label:'Proteína de leche'},
  {key:'huevo',label:'Huevo'},
  {key:'soja',label:'Soja'},
  {key:'sesamo',label:'Sésamo'},
  {key:'cacahuete',label:'Cacahuete'},
  {key:'frutos_secos',label:'Frutos secos'},
  {key:'pescado',label:'Pescado'},
  {key:'crustaceos',label:'Crustáceos'},
  {key:'mamifero',label:'Mamífero / alfa-gal'},
  {key:'fodmap_fructanos',label:'FODMAP: fructanos'},
  {key:'fodmap_gos',label:'FODMAP: GOS'},
  {key:'fodmap_fructosa',label:'FODMAP: fructosa'},
  {key:'fodmap_polioles',label:'FODMAP: polioles'},
  {key:'sacarosa',label:'Sacarosa'},
  {key:'fpies_comun',label:'Desencadenante FPIES descrito'},
  {key:'procesado_variable',label:'Composición variable'}
];
const FOOD_TAG_LABELS = Object.fromEntries(FOOD_TAG_DEFS.map(x=>[x.key,x.label]));

const DEFAULT_FOODS = [
  {name:'Pasta',category:'Carbohidratos',tags:['gluten','trigo','fodmap_fructanos']},
  {name:'Arroz',category:'Carbohidratos',tags:['fpies_comun']},
  {name:'Patata',category:'Carbohidratos',tags:[]},
  {name:'Pan',category:'Carbohidratos',tags:['gluten','trigo','fodmap_fructanos']},
  {name:'Cuscús',category:'Carbohidratos',tags:['gluten','trigo','fodmap_fructanos']},
  {name:'Maíz',category:'Carbohidratos',tags:[]},
  {name:'Harina de trigo',category:'Cereales',tags:['gluten','trigo','fodmap_fructanos']},
  {name:'Sémola de trigo',category:'Cereales',tags:['gluten','trigo','fodmap_fructanos']},
  {name:'Trigo',category:'Cereales',tags:['gluten','trigo','fodmap_fructanos']},
  {name:'Cebada',category:'Cereales',tags:['gluten','cebada']},
  {name:'Centeno',category:'Cereales',tags:['gluten','centeno','fodmap_fructanos']},
  {name:'Espelta',category:'Cereales',tags:['gluten','trigo','espelta','fodmap_fructanos']},
  {name:'Avena',category:'Cereales',tags:['fpies_comun','gluten_posible','procesado_variable']},
  {name:'Galletas',category:'Preparados',tags:['gluten','trigo','procesado_variable']},
  {name:'Bollería',category:'Preparados',tags:['gluten','trigo','procesado_variable']},
  {name:'Pizza',category:'Preparados',tags:['gluten','trigo','fodmap_fructanos','leche','lactosa_posible','procesado_variable']},

  {name:'Huevo',category:'Proteínas',tags:['huevo','fpies_comun']},
  {name:'Pollo',category:'Proteínas',tags:[]},
  {name:'Pavo',category:'Proteínas',tags:[]},
  {name:'Ternera',category:'Proteínas',tags:['mamifero']},
  {name:'Cerdo',category:'Proteínas',tags:['mamifero']},
  {name:'Cordero',category:'Proteínas',tags:['mamifero']},
  {name:'Carne picada',category:'Proteínas',tags:['mamifero','procesado_variable']},
  {name:'Atún',category:'Proteínas',tags:['pescado','fpies_comun']},
  {name:'Salmón',category:'Proteínas',tags:['pescado','fpies_comun']},
  {name:'Pescado blanco',category:'Proteínas',tags:['pescado','fpies_comun']},
  {name:'Gambas',category:'Proteínas',tags:['crustaceos','fpies_comun']},
  {name:'Langostinos',category:'Proteínas',tags:['crustaceos','fpies_comun']},
  {name:'Tofu',category:'Proteínas',tags:['soja','fpies_comun']},

  {name:'Frankfurt',category:'Embutidos',tags:['mamifero','gluten_posible','trigo_posible','lactosa_posible','procesado_variable']},
  {name:'Cervela',category:'Embutidos',tags:['mamifero','gluten_posible','trigo_posible','lactosa_posible','procesado_variable']},
  {name:'Jamón ibérico',category:'Embutidos',tags:['mamifero']},
  {name:'Jamón dulce',category:'Embutidos',tags:['mamifero','lactosa_posible','procesado_variable']},
  {name:'Chorizo',category:'Embutidos',tags:['mamifero','lactosa_posible','procesado_variable']},

  {name:'Tomate',category:'Verduras',tags:[]},
  {name:'Cebolla',category:'Verduras',tags:['fodmap_fructanos']},
  {name:'Ajo',category:'Verduras',tags:['fodmap_fructanos']},
  {name:'Pimiento',category:'Verduras',tags:[]},
  {name:'Calabacín',category:'Verduras',tags:[]},
  {name:'Berenjena',category:'Verduras',tags:[]},
  {name:'Zanahoria',category:'Verduras',tags:[]},
  {name:'Lechuga',category:'Verduras',tags:[]},
  {name:'Espinacas',category:'Verduras',tags:[]},
  {name:'Brócoli',category:'Verduras',tags:[]},
  {name:'Coliflor',category:'Verduras',tags:['fodmap_polioles']},
  {name:'Champiñones',category:'Verduras',tags:['fodmap_polioles']},
  {name:'Espárragos',category:'Verduras',tags:['fodmap_fructanos']},
  {name:'Alcachofa',category:'Verduras',tags:['fodmap_fructanos']},

  {name:'Plátano',category:'Fruta',tags:[]},
  {name:'Manzana',category:'Fruta',tags:['fodmap_fructosa','fodmap_polioles']},
  {name:'Pera',category:'Fruta',tags:['fodmap_fructosa','fodmap_polioles']},
  {name:'Naranja',category:'Fruta',tags:[]},
  {name:'Fresas',category:'Fruta',tags:[]},
  {name:'Kiwi',category:'Fruta',tags:[]},
  {name:'Uvas',category:'Fruta',tags:[]},
  {name:'Mango',category:'Fruta',tags:['fodmap_fructosa']},
  {name:'Sandía',category:'Fruta',tags:['fodmap_fructosa','fodmap_polioles']},
  {name:'Melocotón',category:'Fruta',tags:['fodmap_polioles']},
  {name:'Ciruelas',category:'Fruta',tags:['fodmap_polioles']},

  {name:'Leche',category:'Lácteos',tags:['lactosa','leche','mamifero','fpies_comun']},
  {name:'Queso',category:'Lácteos',tags:['leche','mamifero','lactosa_posible']},
  {name:'Yogur',category:'Lácteos',tags:['lactosa','leche','mamifero']},
  {name:'Nata',category:'Lácteos',tags:['lactosa','leche','mamifero']},
  {name:'Helado',category:'Lácteos',tags:['lactosa','leche','mamifero','procesado_variable']},

  {name:'Lentejas',category:'Legumbres',tags:['fodmap_gos']},
  {name:'Garbanzos',category:'Legumbres',tags:['fodmap_gos']},
  {name:'Judías',category:'Legumbres',tags:['fodmap_gos']},
  {name:'Guisantes',category:'Legumbres',tags:['fodmap_gos']},
  {name:'Soja',category:'Legumbres',tags:['soja','fodmap_gos','fpies_comun']},

  {name:'Almendras',category:'Frutos secos',tags:['frutos_secos']},
  {name:'Nueces',category:'Frutos secos',tags:['frutos_secos']},
  {name:'Avellanas',category:'Frutos secos',tags:['frutos_secos']},
  {name:'Pistachos',category:'Frutos secos',tags:['frutos_secos']},
  {name:'Cacahuetes',category:'Frutos secos',tags:['cacahuete']},
  {name:'Aguacate',category:'Fruta',tags:[]},
  {name:'Sésamo',category:'Semillas',tags:['sesamo']},

  {name:'Salsa de tomate',category:'Salsas',tags:[]},
  {name:'Mayonesa',category:'Salsas',tags:['huevo','procesado_variable']},
  {name:'Pesto',category:'Salsas',tags:['leche','lactosa_posible','procesado_variable']},
  {name:'Salsa de soja',category:'Salsas',tags:['soja','gluten_posible','trigo_posible','procesado_variable']},
  {name:'Kétchup',category:'Salsas',tags:['procesado_variable']},
  {name:'Mostaza',category:'Salsas',tags:['procesado_variable']},
  {name:'Salsa de queso',category:'Salsas',tags:['lactosa','leche','mamifero','procesado_variable']},
  {name:'Tahini',category:'Salsas',tags:['sesamo']},
  {name:'Mermeladas',category:'Preparados',tags:['sacarosa','procesado_variable']},

  {name:'Arroz integral',category:'Carbohidratos',tags:[]},
  {name:'Quinoa',category:'Cereales',tags:[]},
  {name:'Fideos de trigo',category:'Carbohidratos',tags:['gluten','trigo','fodmap_fructanos']},
  {name:'Pan de molde',category:'Carbohidratos',tags:['gluten','trigo','fodmap_fructanos','procesado_variable']},
  {name:'Pan integral',category:'Carbohidratos',tags:['gluten','trigo','fodmap_fructanos']},
  {name:'Pan rallado',category:'Carbohidratos',tags:['gluten','trigo','fodmap_fructanos']},
  {name:'Tortilla de trigo',category:'Carbohidratos',tags:['gluten','trigo','fodmap_fructanos']},
  {name:'Tortilla de maíz',category:'Carbohidratos',tags:[]},
  {name:'Crackers',category:'Preparados',tags:['gluten','trigo','procesado_variable']},
  {name:'Croissant',category:'Preparados',tags:['gluten','trigo','leche','huevo','lactosa_posible','procesado_variable']},
  {name:'Bizcocho',category:'Preparados',tags:['gluten','trigo','leche','huevo','lactosa_posible','procesado_variable']},
  {name:'Cereales de desayuno',category:'Cereales',tags:['gluten_posible','trigo_posible','lactosa_posible','procesado_variable']},
  {name:'Boniato',category:'Carbohidratos',tags:[]},
  {name:'Puré de patata',category:'Carbohidratos',tags:['lactosa_posible','procesado_variable']},
  {name:'Patatas fritas',category:'Carbohidratos',tags:['procesado_variable']},
  {name:'Patatas chips',category:'Dulces y snacks',tags:['procesado_variable']},

  {name:'Mantequilla',category:'Lácteos',tags:['leche','mamifero','lactosa_posible']},
  {name:'Margarina',category:'Grasas y aceites',tags:['procesado_variable']},
  {name:'Aceite de oliva',category:'Grasas y aceites',tags:[]},
  {name:'Aceite de girasol',category:'Grasas y aceites',tags:[]},
  {name:'Aceite de coco',category:'Grasas y aceites',tags:[]},

  {name:'Conejo',category:'Proteínas',tags:['mamifero']},
  {name:'Lomo de cerdo',category:'Proteínas',tags:['mamifero']},
  {name:'Bacon / panceta',category:'Embutidos',tags:['mamifero','procesado_variable']},
  {name:'Salchicha',category:'Embutidos',tags:['mamifero','gluten_posible','trigo_posible','lactosa_posible','procesado_variable']},
  {name:'Hamburguesa de ternera',category:'Proteínas',tags:['mamifero','procesado_variable']},
  {name:'Albóndigas',category:'Preparados',tags:['mamifero','gluten_posible','trigo_posible','lactosa_posible','procesado_variable']},
  {name:'Merluza',category:'Proteínas',tags:['pescado','fpies_comun']},
  {name:'Bacalao',category:'Proteínas',tags:['pescado','fpies_comun']},
  {name:'Sardinas',category:'Proteínas',tags:['pescado','fpies_comun']},
  {name:'Anchoas',category:'Proteínas',tags:['pescado','fpies_comun']},
  {name:'Dorada',category:'Proteínas',tags:['pescado','fpies_comun']},
  {name:'Lubina',category:'Proteínas',tags:['pescado','fpies_comun']},
  {name:'Mejillones',category:'Proteínas',tags:[]},
  {name:'Almejas',category:'Proteínas',tags:[]},
  {name:'Calamar',category:'Proteínas',tags:[]},
  {name:'Sepia',category:'Proteínas',tags:[]},
  {name:'Pulpo',category:'Proteínas',tags:[]},

  {name:'Pepino',category:'Verduras',tags:[]},
  {name:'Puerro',category:'Verduras',tags:['fodmap_fructanos']},
  {name:'Repollo / col',category:'Verduras',tags:[]},
  {name:'Apio',category:'Verduras',tags:[]},
  {name:'Calabaza',category:'Verduras',tags:[]},
  {name:'Remolacha',category:'Verduras',tags:[]},
  {name:'Judía verde',category:'Verduras',tags:[]},
  {name:'Rúcula',category:'Verduras',tags:[]},
  {name:'Canónigos',category:'Verduras',tags:[]},
  {name:'Acelgas',category:'Verduras',tags:[]},
  {name:'Coles de Bruselas',category:'Verduras',tags:[]},
  {name:'Rábano',category:'Verduras',tags:[]},
  {name:'Nabo',category:'Verduras',tags:[]},
  {name:'Olivas / aceitunas',category:'Verduras',tags:[]},
  {name:'Setas',category:'Verduras',tags:['fodmap_polioles']},

  {name:'Piña',category:'Fruta',tags:[]},
  {name:'Mandarina',category:'Fruta',tags:[]},
  {name:'Limón',category:'Fruta',tags:[]},
  {name:'Melón',category:'Fruta',tags:[]},
  {name:'Cerezas',category:'Fruta',tags:['fodmap_polioles']},
  {name:'Frambuesas',category:'Fruta',tags:[]},
  {name:'Arándanos',category:'Fruta',tags:[]},
  {name:'Nectarina',category:'Fruta',tags:['fodmap_polioles']},
  {name:'Albaricoque',category:'Fruta',tags:['fodmap_polioles']},
  {name:'Granada',category:'Fruta',tags:[]},
  {name:'Higos',category:'Fruta',tags:['fodmap_fructosa']},
  {name:'Coco',category:'Fruta',tags:[]},
  {name:'Papaya',category:'Fruta',tags:[]},
  {name:'Pomelo',category:'Fruta',tags:[]},
  {name:'Dátiles',category:'Fruta',tags:['fodmap_fructosa']},

  {name:'Queso crema',category:'Lácteos',tags:['lactosa','leche','mamifero']},
  {name:'Queso fresco',category:'Lácteos',tags:['lactosa','leche','mamifero']},
  {name:'Mozzarella',category:'Lácteos',tags:['leche','mamifero','lactosa_posible']},
  {name:'Parmesano',category:'Lácteos',tags:['leche','mamifero','lactosa_posible']},
  {name:'Kéfir',category:'Lácteos',tags:['lactosa','leche','mamifero']},
  {name:'Requesón / cottage',category:'Lácteos',tags:['lactosa','leche','mamifero']},
  {name:'Leche sin lactosa',category:'Lácteos',tags:['leche','mamifero']},
  {name:'Yogur sin lactosa',category:'Lácteos',tags:['leche','mamifero']},

  {name:'Habas',category:'Legumbres',tags:['fodmap_gos']},
  {name:'Edamame',category:'Legumbres',tags:['soja']},
  {name:'Anacardos',category:'Frutos secos',tags:['frutos_secos','fodmap_gos']},
  {name:'Nueces pecanas',category:'Frutos secos',tags:['frutos_secos']},
  {name:'Macadamias',category:'Frutos secos',tags:['frutos_secos']},
  {name:'Semillas de chía',category:'Semillas',tags:[]},
  {name:'Semillas de lino',category:'Semillas',tags:[]},
  {name:'Semillas de girasol',category:'Semillas',tags:[]},
  {name:'Semillas de calabaza',category:'Semillas',tags:[]},

  {name:'Curry (especias)',category:'Condimentos',tags:['procesado_variable']},
  {name:'Salsa curry',category:'Salsas',tags:['gluten_posible','trigo_posible','lactosa_posible','procesado_variable']},
  {name:'Bechamel',category:'Salsas',tags:['gluten','trigo','lactosa','leche','mamifero']},
  {name:'Salsa barbacoa',category:'Salsas',tags:['procesado_variable']},
  {name:'Alioli',category:'Salsas',tags:['huevo','fodmap_fructanos','procesado_variable']},
  {name:'Salsa carbonara',category:'Salsas',tags:['huevo','leche','mamifero','lactosa_posible','procesado_variable']},
  {name:'Salsa boloñesa',category:'Salsas',tags:['mamifero','fodmap_fructanos','procesado_variable']},
  {name:'Hummus',category:'Salsas',tags:['sesamo','fodmap_gos']},
  {name:'Guacamole',category:'Salsas',tags:['procesado_variable']},
  {name:'Cúrcuma',category:'Condimentos',tags:[]},
  {name:'Comino',category:'Condimentos',tags:[]},
  {name:'Pimentón',category:'Condimentos',tags:[]},
  {name:'Pimienta',category:'Condimentos',tags:[]},
  {name:'Orégano',category:'Condimentos',tags:[]},
  {name:'Canela',category:'Condimentos',tags:[]},
  {name:'Jengibre',category:'Condimentos',tags:[]},
  {name:'Guindilla / picante',category:'Condimentos',tags:[]},

  {name:'Croquetas',category:'Preparados',tags:['gluten','trigo','lactosa','leche','huevo','procesado_variable']},
  {name:'Lasaña',category:'Preparados',tags:['gluten','trigo','leche','mamifero','lactosa_posible','procesado_variable']},
  {name:'Canelones',category:'Preparados',tags:['gluten','trigo','leche','mamifero','lactosa_posible','procesado_variable']},
  {name:'Empanada / empanadilla',category:'Preparados',tags:['gluten','trigo','procesado_variable']},
  {name:'Nuggets',category:'Preparados',tags:['gluten_posible','trigo_posible','procesado_variable']},
  {name:'Tortilla de patatas',category:'Preparados',tags:['huevo']},
  {name:'Chocolate con leche',category:'Dulces y snacks',tags:['leche','lactosa','mamifero','sacarosa','procesado_variable']},
  {name:'Chocolate negro',category:'Dulces y snacks',tags:['sacarosa','procesado_variable']},
  {name:'Caramelos',category:'Dulces y snacks',tags:['sacarosa','procesado_variable']},
  {name:'Chicle sin azúcar',category:'Dulces y snacks',tags:['fodmap_polioles','procesado_variable']},
  {name:'Crema de cacao',category:'Dulces y snacks',tags:['leche','lactosa_posible','frutos_secos','sacarosa','procesado_variable']},

  {name:'Miel',category:'Otros',tags:['fodmap_fructosa']}
];

const DEFAULT_SYMPTOMS = [
  ['Dolor abdominal','Digestivo'],['Retortijones / cólicos','Digestivo'],['Hinchazón','Digestivo'],['Distensión abdominal','Digestivo'],['Gases','Digestivo'],['Diarrea','Digestivo'],['Estreñimiento','Digestivo'],['Náuseas','Digestivo'],['Vómitos','Digestivo'],['Acidez / reflujo','Digestivo'],['Eructos','Digestivo'],['Ruidos intestinales','Digestivo'],['Saciedad precoz','Digestivo'],['Pérdida de apetito','Digestivo'],
  ['Bristol 1 · bolitas duras','Deposiciones'],['Bristol 2 · compacta y grumosa','Deposiciones'],['Bristol 3 · formada con grietas','Deposiciones'],['Bristol 4 · lisa y blanda','Deposiciones'],['Bristol 5 · trozos blandos','Deposiciones'],['Bristol 6 · pastosa','Deposiciones'],['Bristol 7 · líquida','Deposiciones'],['Urgencia para defecar','Deposiciones'],['Evacuación incompleta','Deposiciones'],['Moco en heces','Deposiciones'],['Sangre visible en heces','Deposiciones'],['Más deposiciones de lo habitual','Deposiciones'],['Menos deposiciones de lo habitual','Deposiciones'],
  ['Dolor de cabeza','Dolor'],['Migraña','Dolor'],['Dolor muscular','Dolor'],['Dolor articular','Dolor'],['Dolor lumbar','Dolor'],['Dolor pélvico','Dolor'],
  ['Cansancio','General'],['Debilidad','General'],['Mareo','General'],['Insomnio','General'],['Palidez','General'],['Letargo','General'],['Niebla mental','General'],['Escalofríos','General'],['Desmayo / pérdida de conocimiento','General'],
  ['Picor','Piel'],['Erupción','Piel'],['Urticaria','Piel'],['Sarpullido / enrojecimiento','Piel'],['Eccema','Piel'],['Hormigueo / picor en la boca','Piel'],['Hinchazón de labios / lengua','Piel'],['Hinchazón facial','Piel'],
  ['Congestión','Respiratorio'],['Estornudos','Respiratorio'],['Picor de garganta','Respiratorio'],['Tos','Respiratorio'],['Sibilancias','Respiratorio'],['Dificultad para respirar','Respiratorio'],
  ['Dolor menstrual','Menstrual'],['Calambres menstruales','Menstrual'],['Sensibilidad mamaria','Menstrual'],
  ['Irritabilidad','Ánimo'],['Ánimo bajo','Ánimo'],['Ansiedad','Ánimo'],

  ['Malestar digestivo','Digestivo'],['Pesadez de estómago','Digestivo'],['Sensación de plenitud','Digestivo'],['Digestión lenta','Digestivo'],['Ardor de estómago','Digestivo'],['Regurgitación','Digestivo'],['Hipo','Digestivo'],['Dolor en la boca del estómago','Digestivo'],['Hambre poco después de comer','Digestivo'],
  ['Esfuerzo para defecar','Deposiciones'],['Dolor al defecar','Deposiciones'],['Picor anal','Deposiciones'],['Heces grasientas / aceitosas','Deposiciones'],['Heces flotantes','Deposiciones'],['Heces con olor muy intenso','Deposiciones'],['Restos de comida visibles en heces','Deposiciones'],
  ['Dolor cervical','Dolor'],['Dolor dorsal / espalda','Dolor'],['Dolor de piernas','Dolor'],['Calambres musculares','Dolor'],['Presión / dolor facial','Dolor'],
  ['Somnolencia','General'],['Somnolencia después de comer','General'],['Falta de energía','General'],['Malestar general','General'],['Fiebre','General'],['Sensación febril','General'],['Sudoración','General'],['Sudor frío','General'],['Sed intensa','General'],['Temblor','General'],['Sensación de calor','General'],['Sensación de frío','General'],['Dificultad para concentrarse','General'],
  ['Palpitaciones','Cardiovascular'],['Taquicardia / pulso acelerado','Cardiovascular'],
  ['Dificultad para conciliar el sueño','Sueño'],['Despertares nocturnos','Sueño'],['Sueño no reparador','Sueño'],['Dormir más de lo habitual','Sueño'],['Despertar demasiado temprano','Sueño'],
  ['Acné / brote de granitos','Piel'],['Piel seca','Piel'],['Enrojecimiento facial','Piel'],['Hinchazón de manos / pies','Piel'],['Picor del cuero cabelludo','Piel'],
  ['Moqueo / secreción nasal','Respiratorio'],['Goteo nasal posterior','Respiratorio'],['Ronquera','Respiratorio'],['Opresión en la garganta','Respiratorio'],
  ['Ojos llorosos','Ojos'],['Picor de ojos','Ojos'],['Ojos rojos','Ojos'],['Ojos secos','Ojos'],
  ['Boca seca','Boca y garganta'],['Aftas','Boca y garganta'],['Sabor metálico','Boca y garganta'],['Mal sabor de boca','Boca y garganta'],['Dolor de garganta','Boca y garganta'],
  ['Manchado fuera de la regla','Menstrual'],['Dolor de ovulación','Menstrual'],['Hinchazón premenstrual','Menstrual'],['Cambios de humor premenstruales','Menstrual'],['Antojos premenstruales','Menstrual'],['Acné menstrual','Menstrual'],
  ['Estrés','Ánimo'],['Nerviosismo','Ánimo'],['Cambios de humor','Ánimo'],['Apatía','Ánimo']
];

const CLINICAL_PATTERNS = [
  {
    id:'lactose', name:'Intolerancia a la lactosa', triggerTags:['lactosa'], possibleTriggerTags:['lactosa_posible'], minHours:0, maxHours:6, minExposures:4,
    symptoms:[['Hinchazón',2],['Diarrea',2],['Gases',2],['Náuseas',1],['Dolor abdominal',2],['Vómitos',1]],
    summary:'Compara alimentos con lactosa con síntomas digestivos que aparecen durante las horas siguientes.',
    evidence:'NIDDK describe síntomas dentro de pocas horas tras consumir lactosa.',
    sources:[['NIDDK · Intolerancia a la lactosa','https://www.niddk.nih.gov/health-information/informacion-de-la-salud/enfermedades-digestivas/intolerancia-lactosa/sintomas-causas']]
  },
  {
    id:'celiac', name:'Patrón compatible con enfermedad celíaca', triggerTags:['gluten'], possibleTriggerTags:['gluten_posible'], minHours:0, maxHours:48, minExposures:4, exploratoryWindow:true,
    symptoms:[['Hinchazón',2],['Diarrea',2],['Estreñimiento',1],['Gases',1],['Náuseas',1],['Vómitos',1],['Dolor abdominal',2],['Cansancio',1],['Dolor de cabeza',1],['Erupción',1]],
    summary:'Busca repetición de síntomas alrededor de exposiciones a gluten. La celiaquía no tiene una latencia poscomida suficientemente específica para diagnosticarla.',
    evidence:'El gluten de trigo, cebada y centeno desencadena la enfermedad celíaca, pero el diagnóstico requiere pruebas médicas y no se basa solo en síntomas.',
    warning:'No elimines el gluten antes de realizar pruebas de celiaquía sin indicación médica, porque puede alterar los resultados.',
    sources:[['NIDDK · Síntomas de celiaquía','https://www.niddk.nih.gov/health-information/informacion-de-la-salud/enfermedades-digestivas/enfermedad-celiaca/sintomas-causas'],['NIDDK · Diagnóstico de celiaquía','https://www.niddk.nih.gov/health-information/informacion-de-la-salud/enfermedades-digestivas/enfermedad-celiaca/diagnostico'],['NIDDK · Alimentos con gluten','https://www.niddk.nih.gov/health-information/informacion-de-la-salud/enfermedades-digestivas/enfermedad-celiaca/alimentos-dietas-nutricion']]
  },
  {
    id:'ncws', name:'Sensibilidad al trigo/gluten no celíaca', triggerTags:['trigo','gluten'], possibleTriggerTags:['trigo_posible','gluten_posible'], minHours:0, maxHours:72, minExposures:4,
    symptoms:[['Dolor abdominal',2],['Hinchazón',2],['Diarrea',2],['Estreñimiento',1],['Gases',1],['Dolor de cabeza',1],['Cansancio',1],['Niebla mental',1],['Dolor muscular',1],['Erupción',1]],
    summary:'Compara trigo/gluten con síntomas intestinales y extraintestinales durante horas o días posteriores.',
    evidence:'Revisiones describen síntomas que pueden aparecer en horas o días; no existe un biomarcador diagnóstico validado y deben excluirse celiaquía y alergia al trigo.',
    sources:[['PubMed · Revisión NCWS 2025','https://pubmed.ncbi.nlm.nih.gov/41303655/'],['PubMed · Revisión NCGS','https://pubmed.ncbi.nlm.nih.gov/26355401/']]
  },
  {
    id:'wheat_allergy', name:'Alergia alimentaria al trigo', triggerTags:['trigo'], possibleTriggerTags:['trigo_posible'], minHours:0, maxHours:4, minExposures:4, allergy:true,
    symptoms:[['Urticaria',2],['Sarpullido / enrojecimiento',1],['Hormigueo / picor en la boca',1],['Hinchazón de labios / lengua',2],['Vómitos',1],['Diarrea',1],['Dolor abdominal',1],['Tos',1],['Sibilancias',2],['Mareo',1],['Dificultad para respirar',2],['Desmayo / pérdida de conocimiento',2]],
    summary:'Busca síntomas alérgicos desde minutos hasta unas horas después de alimentos con trigo.',
    evidence:'La FDA incluye el trigo entre los principales alérgenos y describe reacciones desde minutos hasta pocas horas.',
    sources:[['FDA · Alergias alimentarias','https://www.fda.gov/food/buy-store-serve-safe-food/alergias-alimentarias-lo-que-necesita-saber']]
  },
  {
    id:'milk_allergy', name:'Alergia alimentaria a la leche', triggerTags:['leche'], possibleTriggerTags:[], minHours:0, maxHours:4, minExposures:4, allergy:true,
    symptoms:[['Urticaria',2],['Sarpullido / enrojecimiento',1],['Hormigueo / picor en la boca',1],['Hinchazón de labios / lengua',2],['Vómitos',1],['Diarrea',1],['Dolor abdominal',1],['Tos',1],['Sibilancias',2],['Mareo',1],['Dificultad para respirar',2],['Desmayo / pérdida de conocimiento',2]],
    summary:'Busca síntomas alérgicos tras alimentos con proteína de leche; no es lo mismo que intolerancia a la lactosa.',
    evidence:'La leche es uno de los principales alérgenos alimentarios reconocidos por la FDA.',
    sources:[['FDA · Alergias alimentarias','https://www.fda.gov/food/buy-store-serve-safe-food/alergias-alimentarias-lo-que-necesita-saber']]
  },
  {
    id:'egg_allergy', name:'Alergia alimentaria al huevo', triggerTags:['huevo'], possibleTriggerTags:[], minHours:0, maxHours:4, minExposures:4, allergy:true,
    symptoms:[['Urticaria',2],['Sarpullido / enrojecimiento',1],['Hormigueo / picor en la boca',1],['Hinchazón de labios / lengua',2],['Vómitos',1],['Diarrea',1],['Dolor abdominal',1],['Tos',1],['Sibilancias',2],['Mareo',1],['Dificultad para respirar',2]],
    summary:'Busca síntomas alérgicos tras alimentos etiquetados con huevo.',
    evidence:'El huevo es uno de los principales alérgenos alimentarios reconocidos por la FDA.',
    sources:[['FDA · Alergias alimentarias','https://www.fda.gov/food/buy-store-serve-safe-food/alergias-alimentarias-lo-que-necesita-saber']]
  },
  {
    id:'nut_allergy', name:'Alergia a cacahuete / frutos secos', triggerTags:['cacahuete','frutos_secos'], possibleTriggerTags:[], minHours:0, maxHours:4, minExposures:4, allergy:true,
    symptoms:[['Urticaria',2],['Sarpullido / enrojecimiento',1],['Hormigueo / picor en la boca',1],['Hinchazón de labios / lengua',2],['Vómitos',1],['Diarrea',1],['Dolor abdominal',1],['Tos',1],['Sibilancias',2],['Mareo',1],['Dificultad para respirar',2],['Desmayo / pérdida de conocimiento',2]],
    summary:'Busca síntomas alérgicos tras cacahuete o frutos secos.',
    evidence:'Cacahuete y frutos secos figuran entre los principales alérgenos alimentarios de la FDA.',
    sources:[['FDA · Alergias alimentarias','https://www.fda.gov/food/buy-store-serve-safe-food/alergias-alimentarias-lo-que-necesita-saber']]
  },
  {
    id:'fish_shellfish_allergy', name:'Alergia a pescado / crustáceos', triggerTags:['pescado','crustaceos'], possibleTriggerTags:[], minHours:0, maxHours:4, minExposures:4, allergy:true,
    symptoms:[['Urticaria',2],['Sarpullido / enrojecimiento',1],['Hormigueo / picor en la boca',1],['Hinchazón de labios / lengua',2],['Vómitos',1],['Diarrea',1],['Dolor abdominal',1],['Tos',1],['Sibilancias',2],['Mareo',1],['Dificultad para respirar',2],['Desmayo / pérdida de conocimiento',2]],
    summary:'Busca síntomas alérgicos tras pescado o crustáceos.',
    evidence:'Pescado y crustáceos figuran entre los principales alérgenos alimentarios de la FDA.',
    sources:[['FDA · Alergias alimentarias','https://www.fda.gov/food/buy-store-serve-safe-food/alergias-alimentarias-lo-que-necesita-saber']]
  },
  {
    id:'soy_allergy', name:'Alergia alimentaria a la soja', triggerTags:['soja'], possibleTriggerTags:[], minHours:0, maxHours:4, minExposures:4, allergy:true,
    symptoms:[['Urticaria',2],['Sarpullido / enrojecimiento',1],['Hormigueo / picor en la boca',1],['Hinchazón de labios / lengua',2],['Vómitos',1],['Diarrea',1],['Dolor abdominal',1],['Tos',1],['Sibilancias',2],['Mareo',1],['Dificultad para respirar',2]],
    summary:'Busca síntomas alérgicos tras alimentos con soja.',
    evidence:'La soja es uno de los principales alérgenos alimentarios reconocidos por la FDA.',
    sources:[['FDA · Alergias alimentarias','https://www.fda.gov/food/buy-store-serve-safe-food/alergias-alimentarias-lo-que-necesita-saber']]
  },
  {
    id:'sesame_allergy', name:'Alergia alimentaria al sésamo', triggerTags:['sesamo'], possibleTriggerTags:[], minHours:0, maxHours:4, minExposures:4, allergy:true,
    symptoms:[['Urticaria',2],['Sarpullido / enrojecimiento',1],['Hormigueo / picor en la boca',1],['Hinchazón de labios / lengua',2],['Vómitos',1],['Diarrea',1],['Dolor abdominal',1],['Tos',1],['Sibilancias',2],['Mareo',1],['Dificultad para respirar',2]],
    summary:'Busca síntomas alérgicos tras alimentos con sésamo.',
    evidence:'El sésamo es uno de los nueve principales alérgenos alimentarios reconocidos por la FDA.',
    sources:[['FDA · Alergias alimentarias','https://www.fda.gov/food/buy-store-serve-safe-food/alergias-alimentarias-lo-que-necesita-saber']]
  },
  {
    id:'alpha_gal', name:'Síndrome alfa-gal', triggerTags:['mamifero'], possibleTriggerTags:[], minHours:2, maxHours:6, minExposures:4, allergy:true,
    symptoms:[['Urticaria',2],['Picor',1],['Náuseas',1],['Vómitos',1],['Acidez / reflujo',1],['Diarrea',1],['Dolor abdominal',2],['Tos',1],['Dificultad para respirar',2],['Hinchazón de labios / lengua',2],['Mareo',1],['Desmayo / pérdida de conocimiento',2]],
    summary:'Busca síntomas entre 2 y 6 horas tras carne u otros productos de mamífero.',
    evidence:'CDC describe reacciones habitualmente 2–6 horas después de carne o productos que contienen alfa-gal.',
    sources:[['CDC · Alpha-gal Syndrome','https://stacks.cdc.gov/view/cdc/131347/cdc_131347_DS1.pdf']]
  },
  {
    id:'fpies', name:'Patrón FPIES', triggerTags:['fpies_comun'], possibleTriggerTags:[], minHours:1, maxHours:4, minExposures:4,
    symptoms:[['Vómitos',2],['Letargo',2],['Palidez',2],['Diarrea',1],['Dolor abdominal',1],['Náuseas',1]],
    summary:'Busca especialmente vómitos, letargo o palidez 1–4 horas después de alimentos descritos como desencadenantes de FPIES.',
    evidence:'FPIES es poco frecuente; la literatura describe vómitos retrasados, letargo y palidez habitualmente entre 1 y 4 horas. En adultos el patrón puede ser distinto.',
    sources:[['PubMed · NIAID workshop FPIES 2025','https://pubmed.ncbi.nlm.nih.gov/39521282/'],['PubMed · Adult FPIES','https://pubmed.ncbi.nlm.nih.gov/35769585/']]
  },
  {
    id:'fodmap_ibs', name:'Patrón SII / sensibilidad a FODMAP', triggerTags:['fodmap_fructanos','fodmap_gos','fodmap_fructosa','fodmap_polioles','lactosa'], possibleTriggerTags:['lactosa_posible'], minHours:0, maxHours:24, minExposures:4, exploratoryWindow:true,
    symptoms:[['Dolor abdominal',2],['Hinchazón',2],['Gases',2],['Diarrea',2],['Estreñimiento',2]],
    summary:'Busca si alimentos ricos en distintos FODMAP coinciden repetidamente con síntomas intestinales. No diagnostica síndrome de intestino irritable.',
    evidence:'NIDDK describe FODMAP como carbohidratos difíciles de digerir y enumera trigo/centeno, ajo, cebolla, legumbres, ciertos lácteos y frutas entre los alimentos relevantes.',
    sources:[['NIDDK · Alimentación y SII','https://www.niddk.nih.gov/health-information/informacion-de-la-salud/enfermedades-digestivas/sindrome-intestino-irritable/alimentos-dietas-nutricion']]
  }
];

const MEAL_DEFAULT_TIMES = {
  'desayuno':'08:00', 'media mañana':'11:00', 'comida':'14:00', 'merienda':'17:30', 'cena':'21:00', 'snack':'22:30'
};

function uid(prefix='id') { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }
function pad(n){ return String(n).padStart(2,'0'); }
function dateStr(d=new Date()){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function parseDate(s){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function todayStr(){ return dateStr(new Date()); }
function nowTime(){ const d=new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function isFuture(s){ return parseDate(s) > parseDate(todayStr()); }
function esc(s=''){ return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function cap(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : ''; }
function formatDate(s, opts={day:'numeric',month:'long',year:'numeric'}){ return parseDate(s).toLocaleDateString('es-ES', opts); }
function formatTime(t){
  if ((state.meta.hourFormat || '24') === '24') return t;
  const [h,m]=t.split(':').map(Number); const d=new Date(); d.setHours(h,m,0,0);
  return d.toLocaleTimeString('es-ES',{hour:'numeric',minute:'2-digit',hour12:true});
}
function entryDateTime(e){ return new Date(`${e.date}T${e.time || '12:00'}:00`); }
function hoursBetween(a,b){ return (b-a)/36e5; }
function catalogById(id){ return state.catalog.find(x=>x.id===id); }
function activeCatalog(type){ return state.catalog.filter(x=>x.type===type && x.active!==false); }

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORES.entries)) db.createObjectStore(STORES.entries,{keyPath:'id'});
      if(!db.objectStoreNames.contains(STORES.catalog)) db.createObjectStore(STORES.catalog,{keyPath:'id'});
      if(!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta,{keyPath:'key'});
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
function tx(store,mode='readonly'){ return state.db.transaction(store,mode).objectStore(store); }
function getAll(store){ return new Promise((resolve,reject)=>{ const r=tx(store).getAll(); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); }
function put(store,value){ return new Promise((resolve,reject)=>{ const r=tx(store,'readwrite').put(value); r.onsuccess=()=>resolve(value); r.onerror=()=>reject(r.error); }); }
function del(store,key){ return new Promise((resolve,reject)=>{ const r=tx(store,'readwrite').delete(key); r.onsuccess=()=>resolve(); r.onerror=()=>reject(r.error); }); }
function clearStore(store){ return new Promise((resolve,reject)=>{ const r=tx(store,'readwrite').clear(); r.onsuccess=()=>resolve(); r.onerror=()=>reject(r.error); }); }

async function ensureCatalogDefaults(){
  const byKey=(type,name)=>state.catalog.find(i=>i.type===type && i.name.toLowerCase()===name.toLowerCase());
  for(const def of DEFAULT_FOODS){
    let item=byKey('food',def.name);
    if(!item){
      item={id:uid('food'),type:'food',name:def.name,category:def.category,tags:[...def.tags],custom:false,active:true,favorite:false};
      await put(STORES.catalog,item); state.catalog.push(item);
    }else{
      let changed=false;
      if(!Array.isArray(item.tags)){ item.tags=[...def.tags]; changed=true; }
      if(!item.category){ item.category=def.category; changed=true; }
      if(item.active===undefined){ item.active=true; changed=true; }
      if(item.favorite===undefined){ item.favorite=false; changed=true; }
      if(changed) await put(STORES.catalog,item);
    }
  }
  for(const [name,category] of DEFAULT_SYMPTOMS){
    let item=byKey('symptom',name);
    if(!item){
      item={id:uid('symptom'),type:'symptom',name,category,custom:false,active:true,favorite:false};
      await put(STORES.catalog,item); state.catalog.push(item);
    }
  }
  for(const item of state.catalog.filter(i=>i.type==='food')){
    if(!Array.isArray(item.tags)){ item.tags=[]; await put(STORES.catalog,item); }
  }
}

async function loadData(){
  state.entries = await getAll(STORES.entries);
  state.catalog = await getAll(STORES.catalog);
  const metaRows = await getAll(STORES.meta);
  state.meta = {...DEFAULT_META};
  metaRows.forEach(r=>state.meta[r.key]=r.value);
  await ensureCatalogDefaults();
  for(const [key,value] of Object.entries(DEFAULT_META)){
    if(!metaRows.some(r=>r.key===key)) await setMeta(key,value,false);
  }
}
async function setMeta(key,value,refresh=true){ state.meta[key]=value; await put(STORES.meta,{key,value}); if(refresh) applySettings(); }
async function saveEntry(entry){ await put(STORES.entries,entry); const i=state.entries.findIndex(e=>e.id===entry.id); if(i>=0) state.entries[i]=entry; else state.entries.push(entry); refreshAll(); }
async function deleteEntry(id){ await del(STORES.entries,id); state.entries=state.entries.filter(e=>e.id!==id); refreshAll(); }

function applySettings(){
  const chosen=state.meta.theme||'dark';
  const resolved=chosen==='system' ? (matchMedia('(prefers-color-scheme: light)').matches?'light':'dark') : chosen;
  document.documentElement.dataset.theme=resolved;
  document.querySelector('meta[name="theme-color"]').setAttribute('content',resolved==='light'?'#f5f7fb':'#18202d');
  if(document.getElementById('theme-select')) document.getElementById('theme-select').value=chosen;
  if(document.getElementById('hour-format')) document.getElementById('hour-format').value=state.meta.hourFormat||'24';
  if(document.getElementById('correlation-window')) document.getElementById('correlation-window').value=String(state.meta.correlationWindow||72);
}

function showToast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.remove('hidden'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.add('hidden'),2200); }
function showMain(){ document.getElementById('lock-screen').classList.add('hidden'); document.getElementById('main-ui').classList.remove('hidden'); }
function showLock(){ document.getElementById('main-ui').classList.add('hidden'); document.getElementById('lock-screen').classList.remove('hidden'); setTimeout(()=>document.getElementById('pin-input').focus(),50); }

function openSheet(html){ document.getElementById('sheet-content').innerHTML=html; document.getElementById('sheet-backdrop').classList.remove('hidden'); document.getElementById('sheet').classList.remove('hidden'); }
function closeSheet(){ document.getElementById('sheet').classList.add('hidden'); document.getElementById('sheet-backdrop').classList.add('hidden'); document.getElementById('sheet-content').innerHTML=''; }
function sheetHead(title,sub=''){ return `<div class="sheet-head"><div><h2>${esc(title)}</h2>${sub?`<p class="muted small">${esc(sub)}</p>`:''}</div><button class="close-btn" data-close-sheet>×</button></div>`; }

function setView(view){
  state.currentView=view;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(`${view}-view`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const titles={calendar:'Calendario',analysis:'Análisis',settings:'Ajustes'};
  document.getElementById('screen-title').textContent=titles[view];
  document.getElementById('today-btn').style.visibility=view==='calendar'?'visible':'hidden';
  document.getElementById('add-btn').style.display=view==='calendar'?'block':'none';
  if(view==='analysis') renderAnalysis();
  if(view==='settings') renderSettingsState();
}

function monthEntries(){ const y=state.monthCursor.getFullYear(),m=state.monthCursor.getMonth(); return state.entries.filter(e=>{const d=parseDate(e.date);return d.getFullYear()===y&&d.getMonth()===m;}); }
function renderCalendar(){
  const y=state.monthCursor.getFullYear(),m=state.monthCursor.getMonth();
  document.getElementById('month-label').textContent=state.monthCursor.toLocaleDateString('es-ES',{month:'long',year:'numeric'});
  const mEntries=monthEntries();
  const registeredDays=new Set(mEntries.map(e=>e.date)).size;
  const symptomDays=new Set(mEntries.filter(e=>e.type==='symptom').map(e=>e.date)).size;
  document.getElementById('month-summary').textContent=`${registeredDays} días registrados · ${symptomDays} con síntomas`;
  const first=new Date(y,m,1); const mondayIndex=(first.getDay()+6)%7; const start=new Date(y,m,1-mondayIndex);
  const grid=document.getElementById('calendar-grid'); let html='';
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const ds=dateStr(d); const sameMonth=d.getMonth()===m;
    const entries=state.entries.filter(e=>e.date===ds); const mealCount=Math.min(entries.filter(e=>e.type==='meal').length,4);
    const markers=[...Array(mealCount)].map(()=>'<i class="marker meal"></i>').join('')+
      (entries.some(e=>e.type==='symptom')?'<i class="marker symptom"></i>':'')+
      (entries.some(e=>e.type==='period')?'<i class="marker period"></i>':'')+
      (entries.some(e=>e.type==='med')?'<i class="marker med"></i>':'');
    const cls=['day-cell',!sameMonth?'other-month':'',ds===todayStr()?'today':'',isFuture(ds)?'future':'',state.selectedDate===ds?'selected':''].filter(Boolean).join(' ');
    html+=`<button class="${cls}" data-date="${ds}" aria-label="${esc(formatDate(ds))}"><span class="day-number">${d.getDate()}</span><span class="day-markers">${markers}</span></button>`;
  }
  grid.innerHTML=html;
}

function entryTitle(e){
  if(e.type==='meal') return e.name?.trim() || cap(e.mealType||'Comida');
  if(e.type==='symptom') return catalogById(e.symptomId)?.name || e.symptomName || 'Síntoma';
  if(e.type==='period') return 'Menstruación';
  if(e.type==='med') return catalogById(e.medId)?.name || e.medName || 'Medicamento';
  return 'Entrada';
}
function entrySubtitle(e){
  if(e.type==='meal'){
    const foods=(e.foods||[]).map(id=>catalogById(id)?.name).filter(Boolean).join(' · ');
    return [e.name?.trim()?cap(e.mealType||'comida'):'',foods,e.amount?`Cantidad ${e.amount}`:'',e.note||''].filter(Boolean).join(' · ');
  }
  if(e.type==='symptom'){
    const name=catalogById(e.symptomId)?.name||'';
    const isBristol=/^Bristol [1-7]\b/.test(name);
    return [!isBristol && e.intensity!=null?`Intensidad ${e.intensity}/10`:'',!isBristol && e.duration?`Duración ${e.duration}`:'',!isBristol && e.ongoing?'Continúa desde ayer':'',e.note||''].filter(Boolean).join(' · ');
  }
  if(e.type==='period') return [`Flujo ${e.flow}`,`Dolor ${e.pain}/10`,e.note||''].filter(Boolean).join(' · ');
  if(e.type==='med') return [e.dose||'',e.note||''].filter(Boolean).join(' · ');
  return '';
}
function showDay(date){
  state.selectedDate=date; renderCalendar();
  const entries=state.entries.filter(e=>e.date===date).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  const canAdd=!isFuture(date);
  const list=entries.length?`<div class="day-entry-list">${entries.map(e=>`<div class="day-entry"><i class="entry-bar ${e.type}"></i><div class="entry-time">${formatTime(e.time||'12:00')}</div><div class="entry-body"><strong>${esc(entryTitle(e))}</strong><span>${esc(entrySubtitle(e))}</span></div><button class="entry-menu" data-entry-menu="${e.id}">•••</button></div>`).join('')}</div>`:`<div class="empty-state">No hay registros este día.</div>`;
  openSheet(`${sheetHead(formatDate(date,{weekday:'long',day:'numeric',month:'long'}),canAdd?'Registro del día':'Puedes consultar este día, pero no añadir entradas futuras.')}${list}${canAdd?`<button class="primary-btn full" style="margin-top:14px" data-add-for-day="${date}">+ Añadir entrada</button>`:''}`);
}
function showEntryMenu(id){
  const e=state.entries.find(x=>x.id===id); if(!e)return;
  openSheet(`${sheetHead(entryTitle(e),formatDate(e.date))}<div class="button-stack"><button class="secondary-btn" data-edit-entry="${id}">Editar</button><button class="danger-btn" data-delete-entry="${id}">Borrar</button></div>`);
}

function showAddPicker(date=state.selectedDate||todayStr()){
  if(isFuture(date)){ showToast('No puedes añadir entradas futuras.'); return; }
  openSheet(`${sheetHead('Añadir entrada',formatDate(date))}<div class="entry-type-grid">
    <button class="type-choice meal" data-add-type="meal" data-date="${date}"><strong>Comida</strong><span>Alimentos, cantidad y hora</span></button>
    <button class="type-choice symptom" data-add-type="symptom" data-date="${date}"><strong>Síntoma</strong><span>Intensidad y duración</span></button>
    <button class="type-choice period" data-add-type="period" data-date="${date}"><strong>Regla</strong><span>Flujo y dolor</span></button>
    <button class="type-choice med" data-add-type="med" data-date="${date}"><strong>Medicamento</strong><span>Dosis y hora</span></button>
  </div>`);
}

function guessMealType(){ const h=new Date().getHours(); if(h<10)return'desayuno'; if(h<12)return'media mañana'; if(h<16)return'comida'; if(h<19)return'merienda'; if(h<23)return'cena'; return'snack'; }
function mealTimeForType(type){ return MEAL_DEFAULT_TIMES[type] || '14:00'; }
function groupedCatalog(type){
  const groups={}; activeCatalog(type).forEach(i=>{(groups[i.category||'Otros'] ||= []).push(i)}); return groups;
}
function recentFoodIds(){
  const meals=state.entries.filter(e=>e.type==='meal').sort((a,b)=>entryDateTime(b)-entryDateTime(a)); const seen=[];
  for(const m of meals) for(const id of (m.foods||[])) if(!seen.includes(id) && catalogById(id)?.active!==false) seen.push(id);
  return seen.slice(0,8);
}
function foodTagSelectorHTML(selectedTags=[],scope='food-tags'){
  const selected=new Set(selectedTags||[]);
  return `<div class="tag-selector" data-tag-scope="${scope}">${FOOD_TAG_DEFS.map(t=>`<button type="button" class="tag-chip ${selected.has(t.key)?'active':''}" data-food-tag-toggle="${t.key}">${esc(t.label)}</button>`).join('')}</div>`;
}
function selectedFoodTags(container=document){ return [...container.querySelectorAll('[data-food-tag-toggle].active')].map(x=>x.dataset.foodTagToggle); }
function ensureMealDraft(date,entry=null){
  if(entry){ state.mealDraft={id:entry.id,date:entry.date,name:entry.name||'',time:entry.time,mealType:entry.mealType,amount:entry.amount||'normal',foods:[...(entry.foods||[])],note:entry.note||''}; }
  else if(date===todayStr()){
    const type=guessMealType(); state.mealDraft={id:null,date,name:'',time:nowTime(),mealType:type,amount:'normal',foods:[],note:''};
  }else{
    state.mealDraft={id:null,date,name:'',time:mealTimeForType('comida'),mealType:'comida',amount:'normal',foods:[],note:''};
  }
}
function syncMealDraftFromForm(){
  if(!state.mealDraft)return;
  const name=document.getElementById('meal-name'), type=document.getElementById('meal-type'), time=document.getElementById('meal-time'), note=document.getElementById('meal-note');
  if(name)state.mealDraft.name=name.value;
  if(type)state.mealDraft.mealType=type.value;
  if(time)state.mealDraft.time=time.value;
  if(note)state.mealDraft.note=note.value;
}
function renderMealForm(date,entry=null){
  if(!state.mealDraft || entry) ensureMealDraft(date,entry);
  const d=state.mealDraft; const groups=groupedCatalog('food'); const recents=recentFoodIds().map(catalogById).filter(Boolean);
  const favorites=(state.meta.favoriteMeals||[]);
  const chips=(items)=>items.map(i=>`<button type="button" class="chip ${d.foods.includes(i.id)?'active':''}" data-food-chip="${i.id}">${esc(i.name)}</button>`).join('');
  const cats=Object.keys(groups).sort((a,b)=>a==='Salsas'?1:b==='Salsas'?-1:a.localeCompare(b,'es')).map(cat=>`<div class="category-block"><div class="category-title">${esc(cat)}</div><div class="segmented">${chips(groups[cat])}</div></div>`).join('');
  openSheet(`${sheetHead(d.id?'Editar comida':'Añadir comida',formatDate(d.date))}<form id="meal-form" class="form-grid">
    <label class="field-label">Nombre de la comida <span class="muted small">opcional, por ejemplo “Pasta boloñesa”</span><input id="meal-name" class="field-input" value="${esc(d.name||'')}" placeholder="Nombre del plato o comida"></label>
    <div class="two-col"><label class="field-label">Tipo<select id="meal-type" class="field-input">${['desayuno','media mañana','comida','merienda','cena','snack'].map(x=>`<option ${d.mealType===x?'selected':''}>${x}</option>`).join('')}</select></label><label class="field-label">Hora<input id="meal-time" class="field-input" type="time" value="${d.time}"></label></div>
    ${favorites.length?`<div><div class="category-title">Comidas favoritas</div><div class="segmented">${favorites.map(f=>`<button type="button" class="chip favorite" data-fav-meal="${f.id}">${esc(f.name)}</button>`).join('')}</div></div>`:''}
    ${recents.length?`<div><div class="category-title">Recientes</div><div class="segmented">${chips(recents)}</div></div>`:''}
    <div class="toolbar-row"><input id="food-search" class="field-input" placeholder="Buscar ingrediente…"><button type="button" class="secondary-btn" id="toggle-new-food">+ Nuevo</button></div>
    <div id="new-food-panel" class="card compact-card hidden">
      <div class="two-col"><label class="field-label">Nombre<input id="new-food-name" class="field-input"></label><label class="field-label">Categoría<select id="new-food-category" class="field-input">${FOOD_CATEGORIES.map(x=>`<option>${x}</option>`).join('')}</select></label></div>
      <div class="field-label" style="margin-top:10px">Etiquetas del alimento <span class="muted small">Se eligen una sola vez. Atria las usa automáticamente en los patrones.</span>${foodTagSelectorHTML([],'new-food')}</div>
      <p class="muted small">En productos procesados la composición cambia según marca/receta. Puedes marcar “puede contener…” y editarlo después.</p>
      <button type="button" id="save-new-food" class="primary-btn">Guardar alimento</button>
    </div>
    <div id="food-categories">${cats}</div>
    <label class="field-label">Cantidad<div class="segmented">${['poca','normal','mucha'].map(x=>`<button type="button" class="chip ${d.amount===x?'active':''}" data-amount="${x}">${cap(x)}</button>`).join('')}</div></label>
    <label class="field-label">Notas opcionales<textarea id="meal-note" class="field-textarea" placeholder="Algo excepcional de esta comida…">${esc(d.note)}</textarea></label>
    <div class="form-actions"><button type="button" id="save-meal-favorite" class="secondary-btn">Guardar como favorita</button><button class="primary-btn" type="submit">Guardar</button></div>
  </form>`);
}

function isBristolSymptomId(id){ return /^Bristol [1-7]\b/.test(catalogById(id)?.name||''); }
function updateSymptomFormFields(){
  const sel=document.getElementById('symptom-select'); if(!sel)return;
  const bristol=isBristolSymptomId(sel.value);
  document.getElementById('symptom-duration-field')?.classList.toggle('hidden',bristol);
  document.getElementById('symptom-intensity-field')?.classList.toggle('hidden',bristol);
  document.getElementById('symptom-ongoing-field')?.classList.toggle('hidden',bristol);
  document.getElementById('symptom-form-hint')?.classList.toggle('hidden',!bristol);
}
function renderSymptomForm(date,entry=null){
  const symptoms=activeCatalog('symptom'); const favorites=symptoms.filter(x=>x.favorite); const groups=groupedCatalog('symptom');
  const bristolSymptoms=symptoms.filter(x=>/^Bristol [1-7]\b/.test(x.name));
  const selected=entry?.symptomId || favorites[0]?.id || symptoms[0]?.id || '';
  const selectedIsBristol=isBristolSymptomId(selected);
  const intensity=entry?.intensity ?? 5; const duration=entry?.duration||'1 h';
  openSheet(`${sheetHead(entry?'Editar síntoma':'Añadir síntoma',formatDate(date))}<form id="symptom-form" class="form-grid" data-entry-id="${entry?.id||''}" data-date="${date}">
    ${favorites.length?`<div><div class="category-title">Favoritos</div><div class="segmented">${favorites.map(i=>`<button type="button" class="chip favorite ${selected===i.id?'active':''}" data-symptom-chip="${i.id}">${esc(i.name)}</button>`).join('')}</div></div>`:''}
    ${bristolSymptoms.length?`<div><div class="category-title">Deposición · Escala Bristol</div><div class="segmented bristol-quick">${bristolSymptoms.map(i=>`<button type="button" class="chip ${selected===i.id?'active':''}" data-symptom-chip="${i.id}" title="${esc(i.name)}">Tipo ${esc(i.name.match(/^Bristol ([1-7])/)?.[1]||'')}</button>`).join('')}</div><p class="muted small">1–2 más duras · 3–5 formadas/blandas · 6–7 más sueltas.</p></div>`:''}
    <label class="field-label">Síntoma<select id="symptom-select" class="field-input">${Object.entries(groups).map(([cat,items])=>`<optgroup label="${esc(cat)}">${items.map(i=>`<option value="${i.id}" ${selected===i.id?'selected':''}>${esc(i.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <p id="symptom-form-hint" class="muted small ${selectedIsBristol?'':'hidden'}">Para Bristol basta con indicar el tipo y la hora; no necesita intensidad ni duración.</p>
    <button type="button" class="inline-link" id="toggle-new-symptom">+ Crear síntoma nuevo</button>
    <div id="new-symptom-panel" class="card compact-card hidden"><div class="two-col"><label class="field-label">Nombre<input id="new-symptom-name" class="field-input"></label><label class="field-label">Categoría<select id="new-symptom-category" class="field-input">${['Digestivo','Deposiciones','Dolor','General','Cardiovascular','Sueño','Piel','Respiratorio','Ojos','Boca y garganta','Menstrual','Ánimo'].map(x=>`<option>${x}</option>`).join('')}</select></label></div><button type="button" id="save-new-symptom" class="primary-btn" style="margin-top:10px">Guardar síntoma</button></div>
    <div class="two-col"><label class="field-label">Hora<input id="symptom-time" class="field-input" type="time" value="${entry?.time|| (date===todayStr()?nowTime():'12:00')}"></label><label id="symptom-duration-field" class="field-label ${selectedIsBristol?'hidden':''}">Duración<select id="symptom-duration" class="field-input">${['15 min','30 min','1 h','2 h','4 h','Todo el día','En curso'].map(x=>`<option ${duration===x?'selected':''}>${x}</option>`).join('')}</select></label></div>
    <label id="symptom-intensity-field" class="field-label ${selectedIsBristol?'hidden':''}">Intensidad <span class="muted small">1 muy leve · 5 moderado · 10 muy intenso</span><div class="scale-row">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button type="button" class="scale-btn ${intensity===n?'active':''}" data-intensity="${n}">${n}</button>`).join('')}</div><input id="symptom-intensity" type="hidden" value="${intensity}"></label>
    <label id="symptom-ongoing-field" class="field-label ${selectedIsBristol?'hidden':''}"><span><input id="symptom-ongoing" type="checkbox" ${entry?.ongoing?'checked':''}> Continúa desde ayer</span></label>
    <label class="field-label">Notas opcionales<textarea id="symptom-note" class="field-textarea">${esc(entry?.note||'')}</textarea></label>
    <button class="primary-btn" type="submit">Guardar síntoma</button>
  </form>`);
}

function renderPeriodForm(date,entry=null){
  const flow=entry?.flow||'medio'; const pain=entry?.pain??0;
  openSheet(`${sheetHead(entry?'Editar menstruación':'Registrar menstruación',formatDate(date))}<form id="period-form" class="form-grid" data-entry-id="${entry?.id||''}" data-date="${date}">
    <label class="field-label">Flujo<div class="segmented">${['leve','medio','abundante'].map(x=>`<button type="button" class="chip ${flow===x?'active':''}" data-flow="${x}">${cap(x)}</button>`).join('')}</div><input id="period-flow" type="hidden" value="${flow}"></label>
    <label class="field-label">Dolor <span class="muted small">0 sin dolor · 10 máximo</span><div class="segmented">${[0,1,2,3,4,5,6,7,8,9,10].map(n=>`<button type="button" class="scale-btn ${pain===n?'active':''}" data-period-pain="${n}">${n}</button>`).join('')}</div><input id="period-pain" type="hidden" value="${pain}"></label>
    <label class="field-label">Hora<input id="period-time" class="field-input" type="time" value="${entry?.time||(date===todayStr()?nowTime():'12:00')}"></label>
    <label class="field-label">Notas opcionales<textarea id="period-note" class="field-textarea">${esc(entry?.note||'')}</textarea></label>
    <button class="primary-btn" type="submit">Guardar</button>
  </form>`);
}

function renderMedForm(date,entry=null){
  const meds=activeCatalog('med'); const selected=entry?.medId || meds[0]?.id || '';
  openSheet(`${sheetHead(entry?'Editar medicamento':'Añadir medicamento',formatDate(date))}<form id="med-form" class="form-grid" data-entry-id="${entry?.id||''}" data-date="${date}">
    ${meds.length?`<label class="field-label">Medicamento<select id="med-select" class="field-input">${meds.map(i=>`<option value="${i.id}" ${selected===i.id?'selected':''}>${esc(i.name)}</option>`).join('')}</select></label>`:`<div class="empty-state">Todavía no tienes medicamentos guardados.</div>`}
    <button type="button" class="inline-link" id="toggle-new-med">+ Añadir medicamento a mi lista</button>
    <div id="new-med-panel" class="card compact-card hidden"><label class="field-label">Nombre<input id="new-med-name" class="field-input" placeholder="Ej. Ibuprofeno"></label><button type="button" id="save-new-med" class="primary-btn" style="margin-top:10px">Guardar medicamento</button></div>
    <div class="two-col"><label class="field-label">Dosis<input id="med-dose" class="field-input" value="${esc(entry?.dose||'')}" placeholder="Ej. 400 mg o 1 comprimido"></label><label class="field-label">Hora<input id="med-time" class="field-input" type="time" value="${entry?.time||(date===todayStr()?nowTime():'12:00')}"></label></div>
    <label class="field-label">Notas opcionales<textarea id="med-note" class="field-textarea">${esc(entry?.note||'')}</textarea></label>
    <button class="primary-btn" type="submit" ${meds.length?'':'disabled'}>Guardar medicamento</button>
  </form>`);
}

async function addCatalogItem(type,name,category='Otros',tags=[]){
  name=name.trim(); if(!name)return null;
  const existing=state.catalog.find(i=>i.type===type&&i.name.toLowerCase()===name.toLowerCase());
  if(existing){
    let changed=false;
    if(existing.active===false){existing.active=true;changed=true;}
    if(type==='food' && Array.isArray(tags) && tags.length){existing.tags=[...new Set(tags)];changed=true;}
    if(changed) await put(STORES.catalog,existing);
    return existing;
  }
  const item={id:uid(type),type,name,category,custom:true,active:true,favorite:false,...(type==='food'?{tags:[...new Set(tags)]}:{})}; await put(STORES.catalog,item); state.catalog.push(item); return item;
}

function filterByAnalysisPeriod(){ const val=document.getElementById('analysis-period')?.value||'30'; if(val==='all') return [...state.entries]; const cutoff=new Date(); cutoff.setHours(0,0,0,0); cutoff.setDate(cutoff.getDate()-Number(val)+1); return state.entries.filter(e=>entryDateTime(e)>=cutoff); }
function countMap(arr){ const m=new Map(); arr.forEach(x=>m.set(x,(m.get(x)||0)+1)); return [...m.entries()].sort((a,b)=>b[1]-a[1]); }
function symptomNameById(id){ return catalogById(id)?.name || ''; }
function mealTags(meal){ return [...new Set((meal.foods||[]).flatMap(id=>catalogById(id)?.tags||[]))]; }
function triggerInfoForMeal(meal,pattern){
  let weight=0; const triggerFoods=[]; const uncertainFoods=[];
  for(const id of new Set(meal.foods||[])){
    const food=catalogById(id); if(!food)continue; const tags=food.tags||[];
    const exact=tags.some(t=>pattern.triggerTags.includes(t));
    const possible=tags.some(t=>(pattern.possibleTriggerTags||[]).includes(t));
    if(exact){weight=1;triggerFoods.push(food.name);}
    else if(possible){weight=Math.max(weight,.55);uncertainFoods.push(food.name);}
  }
  return {weight,triggerFoods,uncertainFoods};
}
function patternSymptomMap(pattern){ return new Map(pattern.symptoms.map(([name,weight])=>[name,weight])); }
function symptomClinicalAliases(name){
  const aliases=[name];
  if(/^Bristol [67]\b/.test(name)) aliases.push('Diarrea');
  if(/^Bristol [12]\b/.test(name)) aliases.push('Estreñimiento');
  if(name==='Retortijones / cólicos') aliases.push('Dolor abdominal');
  if(name==='Distensión abdominal') aliases.push('Hinchazón');
  return aliases;
}
function symptomsForMealWindow(meal,pattern,symptoms){
  const start=entryDateTime(meal), smap=patternSymptomMap(pattern);
  return symptoms.map(s=>{
    const name=symptomNameById(s.symptomId);
    const aliases=symptomClinicalAliases(name);
    const weights=aliases.map(alias=>smap.get(alias)).filter(Boolean);
    if(!weights.length)return null;
    const lag=hoursBetween(start,entryDateTime(s));
    if(lag<pattern.minHours || lag>pattern.maxHours)return null;
    return {...s,lag,patternWeight:Math.max(...weights)};
  }).filter(Boolean);
}
function computeClinicalPatterns(entries){
  const meals=entries.filter(e=>e.type==='meal').sort((a,b)=>entryDateTime(a)-entryDateTime(b));
  const symptoms=entries.filter(e=>e.type==='symptom').sort((a,b)=>entryDateTime(a)-entryDateTime(b));
  const periodDates=new Set(entries.filter(e=>e.type==='period').map(e=>e.date));
  return CLINICAL_PATTERNS.map(pattern=>{
    const exposures=[]; const background=[];
    for(const meal of meals){
      const info=triggerInfoForMeal(meal,pattern);
      if(info.weight>0) exposures.push({meal,...info}); else background.push(meal);
    }
    let weightedHit=0,totalWeight=0,hits=0,periodMatches=0; const matches=[];
    for(const exp of exposures){
      totalWeight+=exp.weight; const found=symptomsForMealWindow(exp.meal,pattern,symptoms);
      if(found.length){
        hits++; const strength=Math.min(1,Math.max(...found.map(x=>x.patternWeight))/2); weightedHit+=exp.weight*strength;
        periodMatches+=found.filter(x=>periodDates.has(x.date)).length;
        matches.push({meal:exp.meal,triggerFoods:exp.triggerFoods,uncertainFoods:exp.uncertainFoods,symptoms:found});
      }
    }
    let bgHits=0;
    for(const meal of background){ if(symptomsForMealWindow(meal,pattern,symptoms).length) bgHits++; }
    const hitRate=totalWeight?weightedHit/totalWeight:0; const bgRate=background.length?bgHits/background.length:0;
    const contrast=Math.max(0,hitRate-bgRate); const reliability=Math.min(1,totalWeight/10);
    const score=Math.max(0,Math.min(100,Math.round((.72*hitRate+.28*contrast)*100*(.60+.40*reliability))));
    const sufficient=exposures.length>=pattern.minExposures;
    return {...pattern,exposures:exposures.length,totalExposureWeight:totalWeight,hits,hitRate,bgRate,score,sufficient,matches,periodMatches,uncertainExposures:exposures.filter(x=>x.weight<1).length};
  }).sort((a,b)=>(b.sufficient-a.sufficient)||(b.score-a.score)||(b.exposures-a.exposures)||a.name.localeCompare(b.name,'es'));
}
function clinicalWindowText(p){
  const base=p.minHours===0?`0–${p.maxHours} h`:`${p.minHours}–${p.maxHours} h`;
  return p.exploratoryWindow?`${base} · ventana exploratoria, no diagnóstica`:base;
}
function patternLevel(score){ if(score>=70)return'Alta'; if(score>=40)return'Moderada'; return'Baja'; }
function renderClinicalPatterns(entries){
  const el=document.getElementById('clinical-patterns'); if(!el)return;
  const patterns=computeClinicalPatterns(entries); state.lastClinicalPatterns=patterns;
  el.innerHTML=patterns.map((p,i)=>{
    const status=p.sufficient?`${p.score}/100 · ${patternLevel(p.score)}`:`${p.exposures}/${p.minExposures} exposiciones`;
    const fill=p.sufficient?p.score:0;
    return `<button class="pattern-item" data-pattern-index="${i}"><div class="pattern-heading"><div><strong>${esc(p.name)}</strong><div class="meta">${p.sufficient?`${p.hits} de ${p.exposures} exposiciones con síntomas`:'Datos insuficientes'} · ${esc(clinicalWindowText(p))}</div></div><span class="pattern-score ${p.sufficient?'':'insufficient'}">${esc(status)}</span></div><div class="compat-track"><span class="compat-fill" style="width:${fill}%"></span></div></button>`;
  }).join('');
}
function showClinicalPatternDetail(p){
  const triggerLabels=[...new Set([...p.triggerTags,...(p.possibleTriggerTags||[])])].map(k=>FOOD_TAG_LABELS[k]||k);
  const symptomLabels=p.symptoms.map(([n,w])=>`${n}${w>=2?' ★':''}`);
  const matchRows=p.matches.length?p.matches.flatMap(m=>m.symptoms.map(sym=>`<div class="clinical-match"><div><strong>${esc(m.meal.name?.trim()||cap(m.meal.mealType||'comida'))}</strong><div class="meta">${esc(formatDate(m.meal.date,{day:'numeric',month:'short'}))} ${formatTime(m.meal.time)} · ${esc([...m.triggerFoods,...m.uncertainFoods].join(', '))}</div></div><div class="clinical-match-right"><strong>+${sym.lag<1?Math.round(sym.lag*60)+' min':sym.lag.toFixed(sym.lag<10?1:0)+' h'}</strong><span>${esc(symptomNameById(sym.symptomId))}${sym.intensity!=null?` · ${sym.intensity}/10`:''}</span></div></div>`)).join(''):'<div class="empty-state">Todavía no hay coincidencias dentro de esta ventana.</div>';
  const sources=p.sources.map(([label,url])=>`<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join('');
  const allergyNote=p.allergy?`<div class="clinical-warning"><strong>Importante</strong><span>Dificultad para respirar, hinchazón de lengua/garganta o pérdida de conocimiento pueden ser signos de una reacción alérgica grave y requieren atención urgente.</span></div>`:'';
  const warning=p.warning?`<div class="clinical-warning"><strong>A tener en cuenta</strong><span>${esc(p.warning)}</span></div>`:'';
  const dataText=p.sufficient?`<strong>${p.score}/100</strong><span>Índice de compatibilidad · ${p.hits} de ${p.exposures} exposiciones tuvieron síntomas relacionados.</span>`:`<strong>Datos insuficientes</strong><span>${p.exposures} de ${p.minExposures} exposiciones mínimas registradas.</span>`;
  openSheet(`${sheetHead(p.name,'Compatibilidad orientativa; no es una probabilidad de enfermedad ni un diagnóstico.')}
    <div class="clinical-score-card"><div>${dataText}</div>${p.sufficient?`<div class="compat-track large"><span class="compat-fill" style="width:${p.score}%"></span></div>`:''}</div>
    ${warning}${allergyNote}
    <div class="detail-section"><h3>Qué busca Atria</h3><p class="muted small">${esc(p.summary)}</p><div class="tag-list">${triggerLabels.map(x=>`<span class="mini-tag">${esc(x)}</span>`).join('')}</div></div>
    <div class="detail-section"><h3>Síntomas relacionados</h3><p class="muted small">★ = síntoma con mayor peso en este patrón.</p><div class="tag-list">${symptomLabels.map(x=>`<span class="mini-tag symptom-tag">${esc(x)}</span>`).join('')}</div></div>
    <div class="detail-section"><h3>Ventana propia</h3><p>${esc(clinicalWindowText(p))}</p><p class="muted small">${esc(p.evidence)}</p></div>
    <div class="detail-section"><h3>Tus coincidencias</h3>${p.periodMatches?`<p class="muted small">${p.periodMatches} síntomas coincidentes ocurrieron durante días de regla; Atria lo muestra como contexto, sin asumir que sea la causa.</p>`:''}${p.uncertainExposures?`<p class="muted small">${p.uncertainExposures} exposiciones proceden de alimentos marcados como “puede contener”; pesan menos en el índice.</p>`:''}<div class="clinical-match-list">${matchRows}</div></div>
    <div class="detail-section"><h3>Fuentes</h3><div class="source-list">${sources}</div></div>
    <p class="footer-note">Este índice es una herramienta personal de seguimiento. No está validado para diagnosticar ni descartar enfermedades.</p>`);
}

function renderAnalysis(){
  const entries=filterByAnalysisPeriod(); const meals=entries.filter(e=>e.type==='meal'); const symptoms=entries.filter(e=>e.type==='symptom'); const periods=entries.filter(e=>e.type==='period');
  const allFoodIds=meals.flatMap(m=>[...new Set(m.foods||[])]); const foodCounts=countMap(allFoodIds); const symptomCounts=countMap(symptoms.map(s=>s.symptomId));
  const symptomDays=new Set(symptoms.map(e=>e.date)).size; const periodDays=new Set(periods.map(e=>e.date)).size;
  const topFood=foodCounts[0] ? catalogById(foodCounts[0][0])?.name : '—';
  document.getElementById('analysis-summary').innerHTML=[
    [meals.length,'comidas registradas'],[symptomDays,'días con síntomas'],[periodDays,'días con regla'],[topFood,'alimento más repetido']
  ].map(([v,l])=>`<div class="stat-card"><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join('');
  document.getElementById('top-foods').innerHTML=foodCounts.length?foodCounts.slice(0,10).map(([id,n],idx)=>`<div class="rank-item"><div><strong>${idx+1}. ${esc(catalogById(id)?.name||'Alimento')}</strong><div class="meta">${esc(catalogById(id)?.category||'')}</div></div><strong>${n}</strong></div>`).join(''):'<div class="empty-state">Todavía no hay suficientes comidas.</div>';
  document.getElementById('top-symptoms').innerHTML=symptomCounts.length?symptomCounts.slice(0,8).map(([id,n],idx)=>`<div class="rank-item"><div><strong>${idx+1}. ${esc(catalogById(id)?.name||'Síntoma')}</strong><div class="meta">${esc(catalogById(id)?.category||'')}</div></div><strong>${n}</strong></div>`).join(''):'<div class="empty-state">Todavía no hay síntomas registrados.</div>';
  const windowHours=Number(state.meta.correlationWindow||72); document.getElementById('correlation-window-label').textContent=`0–${windowHours} h`;
  const correlations=computeCorrelations(entries,windowHours);
  document.getElementById('correlations-list').innerHTML=correlations.length?correlations.slice(0,20).map((c,i)=>`<button class="correlation-item" data-correlation-index="${i}"><div class="correlation-main"><strong>${esc(c.foodName)} → ${esc(c.symptomName)}</strong><div class="meta">${c.hits} de ${c.exposures} exposiciones · ${Math.round(c.rate*100)} %${c.lags.length?` · ${Math.floor(Math.min(...c.lags))}–${Math.ceil(Math.max(...c.lags))} h`:''}</div></div><span class="badge ${c.levelClass}">${c.level}</span></button>`).join(''):'<div class="empty-state">Necesitas al menos 4 exposiciones a un alimento para empezar a mostrar asociaciones.</div>';
  state.lastCorrelations=correlations;
  const periodDates=new Set(periods.map(p=>p.date)); const cycleSymptomCounts=countMap(symptoms.filter(s=>periodDates.has(s.date)).map(s=>s.symptomId));
  document.getElementById('cycle-analysis').innerHTML=periodDates.size?(cycleSymptomCounts.length?cycleSymptomCounts.slice(0,8).map(([id,n])=>`<div class="rank-item"><div><strong>${esc(catalogById(id)?.name||'Síntoma')}</strong><div class="meta">Apareció ${n} ${n===1?'vez':'veces'} durante días de regla</div></div><span class="badge">${periodDates.size} días de regla</span></div>`).join(''):'<div class="empty-state">Tienes días de regla registrados, pero todavía no coinciden con síntomas.</div>'):'<div class="empty-state">Registra días de menstruación para comparar el ciclo con tus síntomas.</div>';
  renderClinicalPatterns(entries);
}

function computeCorrelations(entries,windowHours){
  const meals=entries.filter(e=>e.type==='meal').sort((a,b)=>entryDateTime(a)-entryDateTime(b)); const symptoms=entries.filter(e=>e.type==='symptom').sort((a,b)=>entryDateTime(a)-entryDateTime(b));
  const exposures=new Map();
  for(const meal of meals) for(const foodId of new Set(meal.foods||[])){ if(!exposures.has(foodId)) exposures.set(foodId,[]); exposures.get(foodId).push(meal); }
  const result=[];
  for(const [foodId,foodMeals] of exposures){
    if(foodMeals.length<4) continue;
    const symptomIds=[...new Set(symptoms.map(s=>s.symptomId))];
    for(const symptomId of symptomIds){ let hits=0; const lags=[]; const matches=[];
      for(const meal of foodMeals){ const start=entryDateTime(meal); const candidates=symptoms.filter(s=>s.symptomId===symptomId && entryDateTime(s)>=start && hoursBetween(start,entryDateTime(s))<=windowHours);
        if(candidates.length){ const first=candidates[0]; const lag=hoursBetween(start,entryDateTime(first)); hits++; lags.push(lag); matches.push({mealDate:meal.date,mealTime:meal.time,symptomDate:first.date,symptomTime:first.time,lag}); }
      }
      if(!hits)continue; const rate=hits/foodMeals.length; const level=rate>=.75?'Alta':rate>=.5?'Moderada':'Baja';
      result.push({foodId,symptomId,foodName:catalogById(foodId)?.name||'Alimento',symptomName:catalogById(symptomId)?.name||'Síntoma',exposures:foodMeals.length,hits,rate,lags,matches,level,levelClass:level==='Alta'?'high':level==='Moderada'?'medium':'low'});
    }
  }
  return result.sort((a,b)=>b.exposures-a.exposures || b.rate-a.rate || b.hits-a.hits);
}
function showCorrelationDetail(c){
  openSheet(`${sheetHead(`${c.foodName} → ${c.symptomName}`,'Posible asociación; no demuestra causalidad.')}<div class="card compact-card"><strong>${c.hits} de ${c.exposures} exposiciones (${Math.round(c.rate*100)} %)</strong><p class="muted small">Nivel orientativo: ${c.level}${c.lags.length?` · aparición entre ${Math.floor(Math.min(...c.lags))} y ${Math.ceil(Math.max(...c.lags))} horas`:''}.</p></div><div class="match-list">${c.matches.map(m=>`<div class="match-row"><span>${esc(formatDate(m.mealDate,{day:'numeric',month:'short'}))} ${formatTime(m.mealTime)}</span><strong>+${Math.round(m.lag)} h</strong><span>${esc(formatDate(m.symptomDate,{day:'numeric',month:'short'}))} ${formatTime(m.symptomTime)}</span></div>`).join('')}</div>`);
}

function renderSettingsState(){
  applySettings();
  const t=document.getElementById('last-backup-text'); if(t) t.textContent=state.meta.lastBackupAt?`Última exportación: ${new Date(state.meta.lastBackupAt).toLocaleString('es-ES')}`:'Todavía no has exportado ninguna copia.';
}
function refreshAll(){ renderCalendar(); if(state.currentView==='analysis')renderAnalysis(); if(state.currentView==='settings')renderSettingsState(); }

function downloadBlob(blob,name){ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
async function exportJSON(){
  const payload={app:'Atria',version:2,exportedAt:new Date().toISOString(),entries:state.entries,catalog:state.catalog,meta:{...state.meta,lastBackupAt:new Date().toISOString()}};
  const stamp=todayStr(); downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`atria-backup-${stamp}.json`); await setMeta('lastBackupAt',new Date().toISOString()); renderSettingsState(); showToast('Copia JSON exportada.');
}
function exportCSV(){
  const headers=['date','time','type','title','meal_name','meal_type','foods','amount','intensity','duration','flow','pain','dose','note'];
  const rows=state.entries.sort((a,b)=>entryDateTime(a)-entryDateTime(b)).map(e=>[
    e.date,e.time||'',e.type,entryTitle(e),e.name||'',e.mealType||'',(e.foods||[]).map(id=>catalogById(id)?.name||id).join('|'),e.amount||'',e.intensity??'',e.duration||'',e.flow||'',e.pain??'',e.dose||'',e.note||''
  ]);
  const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadBlob(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),`atria-datos-${todayStr()}.csv`); showToast('CSV exportado.');
}
async function importJSONFile(file){
  try{
    const text=await file.text(); const data=JSON.parse(text);
    if(data.app!=='Atria'||!Array.isArray(data.entries)||!Array.isArray(data.catalog)) throw new Error('Archivo no válido');
    if(!confirm('La importación reemplazará todos los datos actuales de Atria. ¿Continuar?'))return;
    if(!confirm('Esta acción no se puede deshacer salvo que tengas otra copia. ¿Reemplazar todo?'))return;
    await clearStore(STORES.entries); await clearStore(STORES.catalog); await clearStore(STORES.meta);
    for(const e of data.entries) await put(STORES.entries,e); for(const c of data.catalog) await put(STORES.catalog,c);
    const importedMeta={...DEFAULT_META,...(data.meta||{})}; for(const [key,value] of Object.entries(importedMeta)) await put(STORES.meta,{key,value});
    await loadData(); applySettings(); refreshAll(); showToast('Copia restaurada correctamente.');
  }catch(err){ alert('No se pudo importar la copia. Comprueba que sea un backup JSON de Atria.'); console.error(err); }
}

function foodTagsText(item){
  const labels=(item.tags||[]).map(k=>FOOD_TAG_LABELS[k]||k); if(!labels.length)return'Sin etiquetas clínicas';
  return labels.slice(0,4).join(' · ')+(labels.length>4?` · +${labels.length-4}`:'');
}
function manageCatalog(type){
  const labels={food:'Alimentos',symptom:'Síntomas',med:'Medicamentos'}; const items=activeCatalog(type).sort((a,b)=>(a.category||'').localeCompare(b.category||'','es')||a.name.localeCompare(b.name,'es'));
  openSheet(`${sheetHead(labels[type],type==='food'?'Cada alimento guarda sus etiquetas una sola vez; Atria las usa automáticamente al analizar patrones. Quitar de la lista no borra el historial.':'Puedes editar tus listas sin cambiar registros pasados.')}<div class="manager-list">${items.map(i=>`<div class="manager-item"><div><strong>${esc(i.name)}</strong><div class="sub">${esc(i.category||'')}</div>${type==='food'?`<div class="food-tag-note">${esc(foodTagsText(i))}</div>`:''}</div><div>${type==='symptom'?`<button class="star-btn ${i.favorite?'active':''}" data-star-item="${i.id}" aria-label="Favorito">★</button>`:''}<button class="mini-btn" data-rename-item="${i.id}">Editar</button>${i.custom?`<button class="mini-btn" data-deactivate-item="${i.id}">Quitar</button>`:''}</div></div>`).join('')}</div><button class="primary-btn full" style="margin-top:12px" data-manager-add="${type}">+ Añadir</button>`);
}
function renderFoodEditor(item=null){
  const tags=item?.tags||[]; const category=item?.category||'Otros';
  openSheet(`${sheetHead(item?'Editar alimento':'Añadir alimento','Las etiquetas se guardan con el alimento; no tendrás que indicarlas cada vez que comas.')}<form id="food-editor-form" class="form-grid" data-item-id="${item?.id||''}">
    <label class="field-label">Nombre<input id="food-editor-name" class="field-input" value="${esc(item?.name||'')}" placeholder="Ej. Pan de espelta"></label>
    <label class="field-label">Categoría<select id="food-editor-category" class="field-input">${FOOD_CATEGORIES.map(x=>`<option ${category===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label class="field-label">Etiquetas${foodTagSelectorHTML(tags,'food-editor')}</label>
    <p class="muted small">Para productos preparados o de marca, revisa su etiqueta real. Si no estás segura, usa “Puede contener…” en vez de marcar el ingrediente como seguro.</p>
    <button class="primary-btn" type="submit">Guardar alimento</button>
  </form>`);
}
async function renameItem(id){
  const item=catalogById(id); if(!item)return; if(item.type==='food')return renderFoodEditor(item);
  const name=prompt('Nombre:',item.name); if(!name?.trim())return; item.name=name.trim();
  if(item.type!=='med'){ const category=prompt('Categoría:',item.category||'Otros'); if(category?.trim()) item.category=category.trim(); }
  await put(STORES.catalog,item); manageCatalog(item.type); refreshAll();
}
async function deactivateItem(id){ const item=catalogById(id); if(!item)return; if(!confirm(`Quitar “${item.name}” de futuras selecciones? El historial antiguo se conservará.`))return; item.active=false; await put(STORES.catalog,item); manageCatalog(item.type); refreshAll(); }
async function toggleFavorite(id){ const item=catalogById(id); if(!item)return; item.favorite=!item.favorite; await put(STORES.catalog,item); manageCatalog(item.type); }
async function managerAdd(type){
  if(type==='food')return renderFoodEditor();
  const name=prompt(type==='symptom'?'Nombre del síntoma:':'Nombre del medicamento:'); if(!name?.trim())return; let cat='Otros';
  if(type==='symptom')cat=prompt('Categoría (ej. Digestivo, Dolor, General):','General')||'General'; await addCatalogItem(type,name,cat); manageCatalog(type);
}

async function resetApp(){
  if(!confirm('Esto borrará todos los registros, listas personalizadas y ajustes de Atria. ¿Continuar?'))return;
  const p=prompt('Escribe el PIN de Atria para confirmar:'); if(!(await verifyPin(p))){alert('PIN incorrecto.');return;}
  if(!confirm('Última confirmación: ¿borrar todos los datos?'))return;
  await clearStore(STORES.entries); await clearStore(STORES.catalog); await clearStore(STORES.meta); await loadData(); state.selectedDate=null; state.monthCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1); applySettings(); refreshAll(); showToast('Atria se ha restablecido.');
}

function bindEvents(){
  document.getElementById('pin-submit').addEventListener('click',async()=>{ const input=document.getElementById('pin-input'); if(await verifyPin(input.value)){localStorage.setItem('atria_trusted','1');input.value='';document.getElementById('pin-error').textContent='';showMain();renderCalendar();navigator.storage?.persist?.().catch(()=>{});}else document.getElementById('pin-error').textContent='PIN incorrecto.'; });
  document.getElementById('pin-input').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('pin-submit').click();});
  document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  document.getElementById('today-btn').addEventListener('click',()=>{state.monthCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1);state.selectedDate=todayStr();renderCalendar();});
  document.getElementById('prev-month').addEventListener('click',()=>{state.monthCursor=new Date(state.monthCursor.getFullYear(),state.monthCursor.getMonth()-1,1);renderCalendar();});
  document.getElementById('next-month').addEventListener('click',()=>{state.monthCursor=new Date(state.monthCursor.getFullYear(),state.monthCursor.getMonth()+1,1);renderCalendar();});
  document.getElementById('calendar-grid').addEventListener('click',e=>{const b=e.target.closest('[data-date]');if(b)showDay(b.dataset.date);});
  document.getElementById('add-btn').addEventListener('click',()=>showAddPicker(state.selectedDate||todayStr()));
  document.getElementById('sheet-backdrop').addEventListener('click',closeSheet);
  document.getElementById('analysis-period').addEventListener('change',renderAnalysis);
  document.getElementById('theme-select').addEventListener('change',e=>setMeta('theme',e.target.value));
  document.getElementById('hour-format').addEventListener('change',e=>setMeta('hourFormat',e.target.value));
  document.getElementById('correlation-window').addEventListener('change',e=>setMeta('correlationWindow',Number(e.target.value)));
  document.getElementById('export-json').addEventListener('click',exportJSON); document.getElementById('export-csv').addEventListener('click',exportCSV);
  document.getElementById('import-json').addEventListener('click',()=>document.getElementById('import-file').click()); document.getElementById('import-file').addEventListener('change',e=>{if(e.target.files[0])importJSONFile(e.target.files[0]);e.target.value='';});
  document.getElementById('lock-now').addEventListener('click',()=>{localStorage.removeItem('atria_trusted');showLock();}); document.getElementById('reset-app').addEventListener('click',resetApp);
  document.querySelectorAll('[data-manage]').forEach(b=>b.addEventListener('click',()=>manageCatalog(b.dataset.manage)));

  document.getElementById('sheet').addEventListener('click',async e=>{
    if(e.target.closest('[data-close-sheet]')) return closeSheet();
    const addDay=e.target.closest('[data-add-for-day]'); if(addDay)return showAddPicker(addDay.dataset.addForDay);
    const type=e.target.closest('[data-add-type]'); if(type){ const d=type.dataset.date; if(type.dataset.addType==='meal'){state.mealDraft=null;renderMealForm(d);} if(type.dataset.addType==='symptom')renderSymptomForm(d); if(type.dataset.addType==='period')renderPeriodForm(d); if(type.dataset.addType==='med')renderMedForm(d); return; }
    const menu=e.target.closest('[data-entry-menu]'); if(menu)return showEntryMenu(menu.dataset.entryMenu);
    const edit=e.target.closest('[data-edit-entry]'); if(edit){ const ent=state.entries.find(x=>x.id===edit.dataset.editEntry); if(!ent)return; if(ent.type==='meal')renderMealForm(ent.date,ent); if(ent.type==='symptom')renderSymptomForm(ent.date,ent); if(ent.type==='period')renderPeriodForm(ent.date,ent); if(ent.type==='med')renderMedForm(ent.date,ent); return; }
    const dele=e.target.closest('[data-delete-entry]'); if(dele){ const ent=state.entries.find(x=>x.id===dele.dataset.deleteEntry); if(ent&&confirm(`¿Borrar “${entryTitle(ent)}”?`)){ await deleteEntry(ent.id); closeSheet(); showToast('Entrada borrada.'); } return; }
    const tag=e.target.closest('[data-food-tag-toggle]'); if(tag){tag.classList.toggle('active');return;}
    const food=e.target.closest('[data-food-chip]'); if(food){ const id=food.dataset.foodChip; const arr=state.mealDraft.foods; state.mealDraft.foods=arr.includes(id)?arr.filter(x=>x!==id):[...arr,id]; food.classList.toggle('active'); return; }
    const amt=e.target.closest('[data-amount]'); if(amt){state.mealDraft.amount=amt.dataset.amount;document.querySelectorAll('[data-amount]').forEach(x=>x.classList.toggle('active',x===amt));return;}
    const fav=e.target.closest('[data-fav-meal]'); if(fav){const f=(state.meta.favoriteMeals||[]).find(x=>x.id===fav.dataset.favMeal);if(f){syncMealDraftFromForm();state.mealDraft.foods=[...f.foods];state.mealDraft.mealType=f.mealType||state.mealDraft.mealType;state.mealDraft.time=mealTimeForType(state.mealDraft.mealType);state.mealDraft.amount=f.amount||'normal';state.mealDraft.name=f.mealName||state.mealDraft.name||'';renderMealForm(state.mealDraft.date);}return;}
    if(e.target.id==='toggle-new-food'){document.getElementById('new-food-panel').classList.toggle('hidden');return;}
    if(e.target.id==='save-new-food'){syncMealDraftFromForm();const panel=document.getElementById('new-food-panel');const tags=selectedFoodTags(panel);const item=await addCatalogItem('food',document.getElementById('new-food-name').value,document.getElementById('new-food-category').value,tags);if(item){if(!state.mealDraft.foods.includes(item.id))state.mealDraft.foods.push(item.id);renderMealForm(state.mealDraft.date);showToast('Alimento añadido.');}return;}
    const symChip=e.target.closest('[data-symptom-chip]'); if(symChip){document.getElementById('symptom-select').value=symChip.dataset.symptomChip;document.querySelectorAll('[data-symptom-chip]').forEach(x=>x.classList.toggle('active',x.dataset.symptomChip===symChip.dataset.symptomChip));updateSymptomFormFields();return;}
    const intens=e.target.closest('[data-intensity]'); if(intens){document.getElementById('symptom-intensity').value=intens.dataset.intensity;document.querySelectorAll('[data-intensity]').forEach(x=>x.classList.toggle('active',x===intens));return;}
    if(e.target.id==='toggle-new-symptom'){document.getElementById('new-symptom-panel').classList.toggle('hidden');return;}
    if(e.target.id==='save-new-symptom'){const item=await addCatalogItem('symptom',document.getElementById('new-symptom-name').value,document.getElementById('new-symptom-category').value);if(item){renderSymptomForm(document.getElementById('symptom-form').dataset.date);showToast('Síntoma añadido.');}return;}
    const flow=e.target.closest('[data-flow]'); if(flow){document.getElementById('period-flow').value=flow.dataset.flow;document.querySelectorAll('[data-flow]').forEach(x=>x.classList.toggle('active',x===flow));return;}
    const pp=e.target.closest('[data-period-pain]'); if(pp){document.getElementById('period-pain').value=pp.dataset.periodPain;document.querySelectorAll('[data-period-pain]').forEach(x=>x.classList.toggle('active',x===pp));return;}
    if(e.target.id==='toggle-new-med'){document.getElementById('new-med-panel').classList.toggle('hidden');return;}
    if(e.target.id==='save-new-med'){const item=await addCatalogItem('med',document.getElementById('new-med-name').value,'Medicamentos');if(item){renderMedForm(document.getElementById('med-form').dataset.date);showToast('Medicamento añadido.');}return;}
    if(e.target.id==='save-meal-favorite'){ syncMealDraftFromForm(); if(!state.mealDraft.foods.length){showToast('Selecciona alimentos primero.');return;} const name=prompt('Nombre de esta comida favorita:',state.mealDraft.name||'Comida habitual'); if(name?.trim()){const favs=[...(state.meta.favoriteMeals||[])];favs.push({id:uid('fav'),name:name.trim(),mealName:state.mealDraft.name||'',foods:[...state.mealDraft.foods],mealType:state.mealDraft.mealType,amount:state.mealDraft.amount});await setMeta('favoriteMeals',favs,false);showToast('Comida favorita guardada.');}return; }
    const star=e.target.closest('[data-star-item]'); if(star)return toggleFavorite(star.dataset.starItem);
    const rename=e.target.closest('[data-rename-item]'); if(rename)return renameItem(rename.dataset.renameItem);
    const deact=e.target.closest('[data-deactivate-item]'); if(deact)return deactivateItem(deact.dataset.deactivateItem);
    const madd=e.target.closest('[data-manager-add]'); if(madd)return managerAdd(madd.dataset.managerAdd);
  });

  document.getElementById('sheet').addEventListener('input',e=>{
    if(e.target.id==='food-search'){
      const q=e.target.value.trim().toLowerCase(); document.querySelectorAll('#food-categories .chip').forEach(ch=>{ch.style.display=ch.textContent.toLowerCase().includes(q)?'inline-flex':'none';});
    }
    if(['meal-name','meal-time','meal-note'].includes(e.target.id)) syncMealDraftFromForm();
  });
  document.getElementById('sheet').addEventListener('change',e=>{
    if(e.target.id==='symptom-select'){
      document.querySelectorAll('[data-symptom-chip]').forEach(x=>x.classList.toggle('active',x.dataset.symptomChip===e.target.value));
      updateSymptomFormFields();
    }
    if(e.target.id==='meal-type' && state.mealDraft){
      state.mealDraft.mealType=e.target.value; state.mealDraft.time=mealTimeForType(e.target.value);
      const time=document.getElementById('meal-time'); if(time)time.value=state.mealDraft.time;
    }
  });

  document.getElementById('sheet').addEventListener('submit',async e=>{
    e.preventDefault();
    if(e.target.id==='meal-form'){
      if(!state.mealDraft.foods.length){showToast('Selecciona al menos un alimento.');return;}
      const entry={id:state.mealDraft.id||uid('entry'),type:'meal',date:state.mealDraft.date,name:document.getElementById('meal-name').value.trim(),time:document.getElementById('meal-time').value,mealType:document.getElementById('meal-type').value,foods:[...state.mealDraft.foods],amount:state.mealDraft.amount,note:document.getElementById('meal-note').value.trim()};
      await saveEntry(entry); state.mealDraft=null; closeSheet(); showToast('Comida guardada.'); return;
    }
    if(e.target.id==='food-editor-form'){
      const name=document.getElementById('food-editor-name').value.trim(); if(!name){showToast('Escribe un nombre.');return;}
      const category=document.getElementById('food-editor-category').value; const tags=selectedFoodTags(e.target); const id=e.target.dataset.itemId;
      if(id){ const item=catalogById(id); if(item){item.name=name;item.category=category;item.tags=[...new Set(tags)];await put(STORES.catalog,item);} }
      else await addCatalogItem('food',name,category,tags);
      refreshAll(); manageCatalog('food'); showToast('Alimento guardado.'); return;
    }
    if(e.target.id==='symptom-form'){
      const id=document.getElementById('symptom-select').value; if(!id){showToast('Selecciona un síntoma.');return;}
      const bristol=isBristolSymptomId(id);
      const entry={id:e.target.dataset.entryId||uid('entry'),type:'symptom',date:e.target.dataset.date,time:document.getElementById('symptom-time').value,symptomId:id,intensity:bristol?null:Number(document.getElementById('symptom-intensity').value),duration:bristol?'':document.getElementById('symptom-duration').value,ongoing:bristol?false:document.getElementById('symptom-ongoing').checked,note:document.getElementById('symptom-note').value.trim()};
      await saveEntry(entry); closeSheet(); showToast('Síntoma guardado.'); return;
    }
    if(e.target.id==='period-form'){
      const date=e.target.dataset.date; const existingSameDay=state.entries.find(x=>x.type==='period'&&x.date===date&&x.id!==e.target.dataset.entryId); if(existingSameDay){showToast('Ya hay un registro de regla ese día. Edita el existente.');return;}
      const entry={id:e.target.dataset.entryId||uid('entry'),type:'period',date,time:document.getElementById('period-time').value,flow:document.getElementById('period-flow').value,pain:Number(document.getElementById('period-pain').value),note:document.getElementById('period-note').value.trim()};
      await saveEntry(entry); closeSheet(); showToast('Menstruación guardada.'); return;
    }
    if(e.target.id==='med-form'){
      const id=document.getElementById('med-select')?.value; if(!id){showToast('Añade o selecciona un medicamento.');return;}
      const entry={id:e.target.dataset.entryId||uid('entry'),type:'med',date:e.target.dataset.date,time:document.getElementById('med-time').value,medId:id,dose:document.getElementById('med-dose').value.trim(),note:document.getElementById('med-note').value.trim()};
      await saveEntry(entry); closeSheet(); showToast('Medicamento guardado.'); return;
    }
  });

  document.getElementById('correlations-list').addEventListener('click',e=>{const b=e.target.closest('[data-correlation-index]');if(b){const c=state.lastCorrelations?.[Number(b.dataset.correlationIndex)];if(c)showCorrelationDetail(c);}});
  document.getElementById('clinical-patterns').addEventListener('click',e=>{const b=e.target.closest('[data-pattern-index]');if(b){const p=state.lastClinicalPatterns?.[Number(b.dataset.patternIndex)];if(p)showClinicalPatternDetail(p);}});
}

async function init(){
  try{
    state.db=await openDB(); await loadData(); applySettings(); bindEvents(); renderCalendar(); renderSettingsState();
    if(localStorage.getItem('atria_trusted')==='1') showMain(); else showLock();
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
  }catch(err){ console.error(err); document.body.innerHTML='<div style="padding:30px;font-family:sans-serif">Atria no ha podido iniciar el almacenamiento local. Prueba a recargar la página.</div>'; }
}

init();
