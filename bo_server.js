// Server-simulation data layer for the back office.
// Every domain table lives here (seed), is persisted to localStorage (the DB),
// and is read by the pages via window.BOServer.table(name). No data is hardcoded in the UI.
(function(){
  var LS = 'ws_bo_store_v8';
  var SEED = {
    "kpis": [
      {label:'CA réseau (mois)',value:'428 k€',valColor:'var(--color-text)',delta:'▲ +6,4 %',deltaColor:'#2d7a3e'},
      {label:'CA boutique',value:'306 k€',valColor:'var(--color-primary)',delta:'▲ +4,8 %',deltaColor:'#2d7a3e'},
      {label:'CA livraison bureau',value:'122 k€',valColor:'#C87A3F',delta:'▲ +11 %',deltaColor:'#2d7a3e'},
      {label:'Boutiques actives',value:'14 / 15',valColor:'var(--color-text)',delta:'▲ +1 ce trim.',deltaColor:'#2d7a3e'},
      {label:'Commandes du jour',value:'512',valColor:'var(--color-text)',delta:'▲ +38 vs hier',deltaColor:'#2d7a3e'},
      {label:'Adoption whitelist',value:'82 %',valColor:'var(--color-text)',delta:'▼ −3 pts',deltaColor:'var(--color-primary)'},
    ],
    "shops": [
      {id:'bxl',nom:'L\'Atelier — Bruxelles-Centre',ville:'Bruxelles 1000',web:true,contrat:'Succursale',act:true,caShop:29800,caOffice:8400,adoption:96,accent:'var(--color-primary)'},
      {id:'and',nom:'L\'Atelier — Anderlecht',ville:'Anderlecht 1070',web:true,contrat:'Franchise',act:true,caShop:18600,caOffice:6200,adoption:88,accent:'#E8A15C'},
      {id:'ucc',nom:'L\'Atelier — Uccle',ville:'Uccle 1180',web:true,contrat:'Franchise',act:true,caShop:22100,caOffice:9400,adoption:79,accent:'#8C4A2F'},
      {id:'sch',nom:'L\'Atelier — Schaerbeek',ville:'Schaerbeek 1030',web:false,contrat:'Franchise',act:true,caShop:0,caOffice:0,adoption:0,accent:'#E8A15C'},
      {id:'lv',nom:'L\'Atelier — Louvain',ville:'Louvain 3000',web:true,contrat:'Master',act:false,caShop:14200,caOffice:5200,adoption:71,accent:'#8C4A2F'},
    ],
    "catalog": [
      {cat:'Boulangerie',prods:[
        {nom:'Baguette tradition',prix:1.35,statut:'Publié',bw:true,bm:true,ad:96},
        {nom:'Pain au chocolat',prix:1.60,statut:'Publié',bw:true,bm:false,ad:74},
      ]},
      {cat:'Pâtisserie fraîche',prods:[
        {nom:'Éclair chocolat',prix:3.50,statut:'Publié',bw:true,bm:true,ad:88},
        {nom:'Tarte aux fraises',prix:4.20,statut:'Saisonnier',saison:'Été',bw:true,bm:false,ad:52},
        {nom:'Bûche signature',prix:24.00,statut:'Publié',saison:'Noël',bw:true,bm:true,ad:100},
      ]},
      {cat:'Chocolaterie',prods:[
        {nom:'Macarons (boîte 24)',prix:19.90,statut:'Publié',bw:true,bm:false,ad:64},
      ]},
      {cat:'Traiteur',prods:[
        {nom:'Quiche lorraine',prix:5.80,statut:'Brouillon',bw:false,bm:false,ad:22},
        {nom:'Foie gras mi-cuit',prix:28.00,statut:'Publié',bw:true,bm:false,ad:41},
      ]},
      {cat:'Glaces',prods:[
        {nom:'Glace artisanale',prix:6.50,statut:'Publié',saison:'Été',bw:false,bm:false,ad:30},
      ]},
    ],
    "vouchers": [
      {code:'MARQUE15',valeur:'−15 % sur la pâtisserie',type:'Panier',validite:'campagne été'},
      {code:'BIENVENUE',valeur:'Onboarding B2B',type:'add_office',validite:'permanent'},
      {code:'RENTREE10',valeur:'−10 € dès 50 €',type:'Montant',validite:'sept.'},
    ],
    "pricing_rules": [
      {nom:'Menu marque printemps',cible:'Menus',effet:'19,90 €'},
      {nom:'Tarif réseau pâtisserie',cible:'Pâtisserie fraîche',effet:'prix fixe'},
      {nom:'Happy hour réseau',cible:'Boulangerie 18–19h',effet:'−20 %'},
    ],
    "params": [
      {cle:'bo_show_source',type:'bool',def:false},
      {cle:'bo_show_help',type:'bool',def:false},
      {cle:'admin.schema_reports',type:'bool',def:true},
      {cle:'webshop.enabled',type:'bool',def:true},
      {cle:'nav.icon_back',type:'text',val:'arrow-left'},
      {cle:'delivery.enabled',type:'bool',def:true},
      {cle:'order.cutoff_default',type:'text',val:'17:00'},
      {cle:'brand.support_url',type:'text',val:'https://aide.latelierby.be'},
    ],
    "email_templates": [
      {cle:'order_confirm',langue:'FR',sujet:'Votre commande {{commande_ref}} est confirmée'},
      {cle:'order_ready',langue:'FR',sujet:'Votre commande est prête'},
      {cle:'invoice',langue:'FR',sujet:'Facture {{commande_ref}}'},
      {cle:'office_onboarding',langue:'FR',sujet:'Bienvenue — votre compte {{bureau}}'},
      {cle:'office_reject',langue:'FR',sujet:'Votre demande de rattachement'},
    ],
    "users": [
      {nom:'Sophie Renard',email:'sophie.renard@latelierby.be',role:'Siège',portee:'Réseau complet',act:true},
      {nom:'Thomas Legrand',email:'thomas.legrand@latelierby.be',role:'Franchise',portee:'Bruxelles-Centre',act:true},
      {nom:'Marek Kowalski',email:'m.kowalski@latelierby.be',role:'Franchise',portee:'Anderlecht, Uccle',act:true},
      {nom:'Julie Peeters',email:'j.peeters@latelierby.be',role:'Franchise',portee:'Louvain',act:false},
    ],
    "audit": [
      {ts:'17/07 14:22',user:'Sophie Renard',verb:'Modification',entity:'ws_products #128 (brand_mandatory)',shop:'Réseau'},
      {ts:'17/07 13:05',user:'Thomas Legrand',verb:'Création',entity:'ws_vouchers BXL10',shop:'Bruxelles-Centre'},
      {ts:'17/07 11:40',user:'Sophie Renard',verb:'Modification',entity:'ws_param webshop.enabled',shop:'Réseau'},
      {ts:'16/07 18:12',user:'Marek Kowalski',verb:'Suppression',entity:'ws_office_delivery_sites #44',shop:'Anderlecht'},
      {ts:'16/07 09:30',user:'Sophie Renard',verb:'Création',entity:'bo_users j.peeters',shop:'Louvain'},
    ],
    "fr_alertes": [
      {color:'var(--color-primary)',titre:'Encours dépassé — Belga SPRL',detail:'4 120 € / plafond 4 000 € · commande bloquée'},
      {color:'var(--color-primary)',titre:'Incident — Café Belga',detail:'Colis endommagé · avoir 24 € en attente de décision'},
      {color:'#c9a24b',titre:'Encours à 92 % — Delcourt',detail:'2 760 € / 3 000 € · à surveiller'},
      {color:'#c9a24b',titre:'Écart km — Tournée Uccle / Waterloo',detail:'+24 % vs prévu · détour Waterloo non planifié'},
    ],
    "fr_live_drivers": [
      {color:'#8D1D2C',nom:'Marek Kowalski',info:'BXL-Centre · Renault frigo',avancement:'3/4'},
      {color:'#3B3468',nom:'Julien Dubois',info:'Sud · Iveco Daily',avancement:'1/3'},
    ],
    "fr_clients": [
      {raison:'Le Cirio SA',code:'CL-0021',seg:'horeca',statut:'actif',tva:'BE 0421.111.222',paiement:'30 j fin de mois',plafond:6000,encours:3200,franco:'250 €',remise:'8 %',fact:'Mensuel',points:[
        {libelle:'Brasserie — entrée arrière',adresse:'Rue de la Bourse 18, 1000 Bruxelles',fenetre:'08:00–11:00',jours:'L Ma Me J V S',validation:'QR',marge:230},
      ]},
      {raison:'Rocco Forte',code:'CL-0044',seg:'horeca',statut:'actif',tva:'BE 0455.222.333',paiement:'30 j',plafond:8000,encours:2600,franco:'300 €',remise:'10 %',fact:'Hebdomadaire',points:[
        {libelle:'Cuisine — quai de service',adresse:'Rue de l\'Amigo 1-3, 1000 Bruxelles',fenetre:'07:30–10:00',jours:'L Ma Me J V',validation:'PIN',marge:205},
      ]},
      {raison:'Belga SPRL',code:'CL-0052',seg:'horeca',statut:'suspendu',tva:'BE 0466.333.444',paiement:'7 j',plafond:4000,encours:4120,franco:'—',remise:'5 %',fact:'Par livraison',points:[
        {libelle:'Terrasse — accès Flagey',adresse:'Place Eugène Flagey 18, 1050 Ixelles',fenetre:'09:00–11:30',jours:'Ma Me J V S',validation:'Signature',marge:60},
      ]},
      {raison:'Dandoy',code:'CL-0060',seg:'retail',statut:'actif',tva:'BE 0401.444.555',paiement:'30 j',plafond:5000,encours:1900,franco:'200 €',remise:'6 %',fact:'Mensuel',points:[
        {libelle:'Boutique Sablon — arrière',adresse:'Rue Charles Buls 14, 1000 Bruxelles',fenetre:'08:00–10:30',jours:'L Me V',validation:'QR',marge:180},
      ]},
      {raison:'KBC Group',code:'CL-0071',seg:'corporate',statut:'actif',tva:'BE 0403.227.515',paiement:'30 j fin de mois',plafond:12000,encours:5400,franco:'400 €',remise:'12 %',fact:'Mensuel',points:[
        {libelle:'Cafétéria HQ — hall livraison',adresse:'Havenlaan 2, 3000 Leuven',fenetre:'07:00–09:00',jours:'L Ma Me J V',validation:'PIN',marge:-15},
      ]},
      {raison:'Événements Sud',code:'CL-0088',seg:'event',statut:'prospect',tva:'BE 0788.555.666',paiement:'Comptant',plafond:2000,encours:0,franco:'—',remise:'0 %',fact:'Par livraison',points:[
        {libelle:'Château — accès traiteur',adresse:'Chaussée de Bruxelles 100, 1410 Waterloo',fenetre:'11:00–13:00',jours:'S D',validation:'Dépôt libre',marge:-78},
      ]},
    ],
    "fr_incidents": [
      {type:'Colis endommagé',point:'Café Belga · Ixelles',heure:'aujourd\'hui 09:12',statut:'À traiter',icon:'!',iconBg:'#fbe9eb',iconColor:'var(--color-primary)',ref:'INC-2026-0412',geo:'50.8275, 4.3705',horodatage:'17 juil. 2026 09:12',chauffeur:'Marek Kowalski',impact:'24 €',impactRef:'avoir estimé',description:'Bac isotherme percuté au déchargement. 2 pots de confiture cassés. Photo prise sur place, réception a refusé la ligne.',statutColor:'var(--color-primary)'},
      {type:'Colis manquant',point:'Hôtel Amigo · Sablon',heure:'aujourd\'hui 08:40',statut:'À traiter',icon:'?',iconBg:'var(--color-background-secondary)',iconColor:'var(--color-text-muted)',ref:'INC-2026-0411',geo:'50.8451, 4.3520',horodatage:'17 juil. 2026 08:40',chauffeur:'Marek Kowalski',impact:'46 €',impactRef:'relivraison',description:'1 colis attendu absent au scan de dépôt. Écart détecté sur le bon de chargement.',statutColor:'var(--color-text-muted)'},
      {type:'Livraison refusée',point:'Event Château · Waterloo',heure:'hier 12:58',statut:'En cours',icon:'✕',iconBg:'#fbe9eb',iconColor:'var(--color-primary)',ref:'INC-2026-0407',geo:'50.7147, 4.3990',horodatage:'16 juil. 2026 12:58',chauffeur:'Julien Dubois',impact:'40 €',impactRef:'marchandise perdue',description:'Arrivée hors fenêtre horaire (13:12 vs 11:00–13:00). Client absent, dépôt refusé.',statutColor:'var(--color-primary)'},
      {type:'Retour consigne',point:'Maison Dandoy · Sablon',heure:'hier 11:20',statut:'Résolu',icon:'↩',iconBg:'#eaf5ec',iconColor:'#2d7a3e',ref:'INC-2026-0403',geo:'50.8410, 4.3560',horodatage:'16 juil. 2026 11:20',chauffeur:'Sofie Peeters',impact:'0 €',impactRef:'sans impact',description:'3 bacs consignés récupérés au point. Rapprochement OK.',statutColor:'#2d7a3e'},
    ],
    "fr_rentabilite": [
      {nom:'Tournée Bruxelles-Centre',sites:[
        {nom:'Brasserie Le Cirio',offices:[{nom:'Cuisine RDC',ca:520,couts:210},{nom:'Bar étage',ca:300,couts:150}]},
        {nom:'Hôtel Nord',offices:[{nom:'Réception',ca:580,couts:312}]},
      ]},
      {nom:'Tournée Sud',sites:[
        {nom:'Café des Arts',offices:[{nom:'Salle',ca:415,couts:413}]},
        {nom:'Résidence Les Tilleuls',offices:[{nom:'Accueil',ca:260,couts:180}]},
      ]},
      {nom:'Tournée Est',sites:[
        {nom:'Traiteur Piotrowski',offices:[{nom:'Atelier',ca:740,couts:360}]},
      ]},
    ],
    // ---- Tables paramétrables (câblées aux formulaires : clés = champs du form) ----
    "ws_tour_availability": [
      {tour:'Tournée Centre-ville',jour:'Lun–Ven',dep:'06:00',fin:'12:00',cut:'17:00 J-1',cap:'10'},
      {tour:'Tournée Uccle / Ixelles',jour:'Lun · Mer · Ven',dep:'06:30',fin:'13:00',cut:'16:00 J-1',cap:'8'},
      {tour:'Tournée Nord (Schaerbeek)',jour:'Mar · Jeu',dep:'07:00',fin:'12:30',cut:'17:00 J-1',cap:'6'},
      {tour:'Tournée Express midi',jour:'Lun–Ven',dep:'11:00',fin:'13:30',cut:'10:00 jour J',cap:'12'},
    ],
    "ws_tour_closures": [
      {tour:'Toutes les tournées',date:'21/07/2026',type:'Férié',motif:'Fête nationale'},
      {tour:'Tournée Nord (Schaerbeek)',date:'29/07/2026',type:'Congé',motif:'Congé chauffeur — M. Dubois'},
      {tour:'Toutes les tournées',date:'15/08/2026',type:'Férié',motif:'Assomption'},
    ],
    "ws_delivery_fee_rules": [
      {niveau:'Site',cible:'Hôtel Nord — quai service',franco:'—',montant:'12,00 €',paiement:'Facturé au bureau'},
      {niveau:'Bureau',cible:'Boucherie Charlier',franco:'150 €',montant:'6,50 €',paiement:'Différé'},
      {niveau:'Tournée',cible:'Tournée Centre-ville',franco:'120 €',montant:'5,00 €',paiement:'Selon bureau'},
      {niveau:'Boutique',cible:'Toutes livraisons',franco:'80 €',montant:'4,50 €',paiement:'Comptant'},
    ],
    // ---- Cadre marque : zone de chalandise (lecture seule côté franchisé, définie par le franchiseur) ----
    "ws_franchisor_catchment": [
      // shop_id/shop_name : mêmes champs que l'API (JOIN shops) — les tuiles
      // « Magasins » de l'écran Zone de chalandise en dépendent. shop_id 2 =
      // la boutique de démo (?shop=2) ; une zone reste non attribuée (gris).
      {id:1,name:'Bruxelles Capitale (19 communes)',cp:'1000 · 1020 · 1030 · 1040 · 1050 · 1060 · 1070 · 1080 · 1081 · 1082 · 1083 · 1090 · 1120 · 1130 · 1140 · 1150 · 1160 · 1170 · 1180 · 1190 · 1200 · 1210',exclusif:true,shop_id:2,shop_name:'L\'Atelier — Bruxelles Centre',shop_city:'Bruxelles'},
      {id:2,name:'Brabant flamand — périphérie',cp:'1600 · 1700 · 1800 · 1930 · 1932 · 3000 · 3001 · 3010 · 3020',exclusif:true,shop_id:3,shop_name:'L\'Atelier — Leuven',shop_city:'Leuven'},
      {id:3,name:'Brabant wallon nord',cp:'1300 · 1310 · 1320 · 1340 · 1348 · 1400 · 1410 · 1420',exclusif:false,shop_id:null,shop_name:null,shop_city:null},
    ],
    // ---- Menu « Clients » : miroir de GET /franchisee/b2b-clients (table client
    //      + agrégats commandes/vouchers/réclamations) — démo seulement. ----
    "b2b_clients": [
      {id:501,name:'Marie',surname:'Verheyden',company_name:'Asima SRL',email:'marie@asima.be',phone_e164:'+32475110022',zip:'1300',city:'Wavre',is_b2b:1,office_id:1,status:0,blocked:0,pwa_user:1,webshop_user:1,fidelity_active:1,invoice_vat:'BE0477112233',tax_number:'BE0477112233',created_at:'2025-11-03 09:12:00',orders_count:14,last_order:'2026-07-18 11:05:00',orders_90d:6,orders_total:812.40,voucher_active:1,voucher_used:0,complaint_open:0,shop_buys:3,office_name:'Asima',tour_name:'Tournée Centre-ville',site_name:'Regent Park',deferred:1,department:'Comptabilité'},
      {id:502,name:'Jonas',surname:'Peeters',company_name:null,email:'jonas.peeters@gmail.com',phone_e164:'+32488220033',zip:'1050',city:'Ixelles',is_b2b:0,office_id:null,status:0,blocked:0,pwa_user:0,webshop_user:1,fidelity_active:0,invoice_vat:null,tax_number:null,created_at:'2026-02-14 14:40:00',orders_count:2,last_order:'2026-05-02 10:22:00',orders_90d:0,orders_total:64.90,voucher_active:0,voucher_used:1,complaint_open:1,shop_buys:0,office_name:null,tour_name:null,site_name:null,deferred:0,department:null},
      {id:503,name:'Lena',surname:'Dossche',company_name:'Connard SA',email:'lena@connard.be',phone_e164:'+32499330044',zip:'1400',city:'Nivelles',is_b2b:1,office_id:2,status:1,blocked:1,pwa_user:0,webshop_user:1,fidelity_active:0,invoice_vat:null,tax_number:'BE0555667788',created_at:'2026-06-20 08:00:00',orders_count:5,last_order:'2026-07-01 09:00:00',orders_90d:3,orders_total:230.00,voucher_active:0,voucher_used:0,complaint_open:0,shop_buys:null,office_name:'Connard SRL',tour_name:'Tournée Uccle / Ixelles',site_name:'Quai des Ateliers',deferred:0,department:'RH'},
    ],
    // ---- Tournées : table unique (constructeur + capacité + validation + horaires lisent ici) ----
    "ws_tours": [
      {id:'r1',name:'Tournée Bruxelles-Centre',short:'Centre',driver:'Marek Kowalski',start:360,max:10,ret:true,forfait:45,amplitude:240,decharge:16,trajet:8,used:4,zone:'Bruxelles Capitale'},
      {id:'r2',name:'Tournée Uccle / Waterloo',short:'Uccle',driver:'Julien Dubois',start:390,max:10,ret:true,forfait:60,amplitude:240,decharge:22,trajet:18,used:6,zone:'Bruxelles Sud'},
      {id:'r3',name:'Tournée Etterbeek / Leuven',short:'Etterbeek',driver:'Sofie Peeters',start:375,max:10,ret:true,forfait:75,amplitude:300,decharge:20,trajet:10,used:5,zone:'Brabant'},
      {id:'r4',name:'Tournée Schaerbeek',short:'Schaerbeek',driver:'Anna Piotrowska',start:405,max:10,ret:true,forfait:40,amplitude:240,decharge:18,trajet:12,used:2,zone:'Bruxelles Nord'},
      {id:'r5',name:'Tournée Anderlecht',short:'Anderlecht',driver:'— non assigné',start:420,max:10,ret:true,forfait:50,amplitude:240,decharge:18,trajet:14,used:0,zone:'Bruxelles Sud'},
      {id:'r6',name:'Tournée Express midi',short:'Express',driver:'— non assigné',start:330,max:10,ret:false,forfait:35,amplitude:180,decharge:12,trajet:10,used:0,zone:'Bruxelles Capitale'},
    ],
    // ---- Chaîne livraison au vrai schéma (ajout additif — decisions A/liaison/zones franchisé) ----
    "ws_delivery_zones": [
      {id:1,name:'Bruxelles Capitale',sort_order:1,active:true,cp:'1000 · 1020 · 1030',vehicule:'Frigo ≤3,5 t',franco:'250 €',delai:'J+1',service:14,catchment:'Bruxelles Capitale (19 communes)'},
      {id:2,name:'Bruxelles Sud',sort_order:2,active:true,cp:'1060 · 1180 · 1190',vehicule:'Standard',franco:'300 €',delai:'J+1',service:16,catchment:'Bruxelles Capitale (19 communes)'},
      {id:3,name:'Bruxelles Nord',sort_order:3,active:true,cp:'1020 · 1090 · 1120',vehicule:'Standard',franco:'250 €',delai:'J+1',service:15,catchment:'Bruxelles Capitale (19 communes)'},
      {id:4,name:'Brabant',sort_order:4,active:true,cp:'1300 · 1340 · 1400',vehicule:'Frigo',franco:'350 €',delai:'J+2',service:20,catchment:'Brabant wallon nord'},
    ],
    "ws_office_delivery_sites": [
      {id:1,office_client_id:1,client_id:'CL-0031',bureau:'Boucherie Charlier',office:'Siège',name:'Boucherie Charlier — Siège',adr:'Rue du Marché 12, 1000 BXL',address:'Rue du Marché 12, 1000 BXL',etage:'RDC',floor_room:'RDC',contact_name:'M. Charlier',contact_phone:'+32 2 000 00 01',tour:'Tournée Centre-ville',tournee_id:1,acc:6,site_access_minutes:6,shop_id:'bxl',active:true},
      {id:2,office_client_id:2,client_id:'CL-0045',bureau:'Hôtel Nord SA',office:'Économat',name:'Hôtel Nord — Économat',adr:'Bd Baudouin 4, 1000 BXL',address:'Bd Baudouin 4, 1000 BXL',etage:'Sous-sol / quai',floor_room:'Sous-sol / quai',contact_name:'Économe',contact_phone:'+32 2 000 00 02',tour:'Tournée Centre-ville',tournee_id:1,acc:12,site_access_minutes:12,shop_id:'bxl',active:true},
      {id:3,office_client_id:3,client_id:'CL-0052',bureau:'Café des Arts',office:'Salle',name:'Café des Arts — Salle',adr:'Rue Royale 88, 1000 BXL',address:'Rue Royale 88, 1000 BXL',etage:'RDC',floor_room:'RDC',contact_name:'Gérant',contact_phone:'+32 2 000 00 03',tour:'Tournée Uccle / Ixelles',tournee_id:2,acc:5,site_access_minutes:5,shop_id:'bxl',active:true},
      {id:4,office_client_id:4,client_id:'CL-0071',bureau:'KBC Group',office:'Cafétéria HQ',name:'KBC — Cafétéria HQ',adr:'Havenlaan 2, 3000 Leuven',address:'Havenlaan 2, 3000 Leuven',etage:'Hall livraison',floor_room:'Hall livraison',contact_name:'Facility',contact_phone:'+32 16 00 00 04',tour:'Tournée Brabant',tournee_id:4,acc:9,site_access_minutes:9,shop_id:'bxl',active:true},
    ],
    // Offices (bureaux) — ws_offices
    "ws_offices": [
      {id:1,tour_id:1,name:'Boucherie Charlier — Siège',address:'Rue du Marché 12',postal_code:'1000',city:'Bruxelles',contact:'M. Charlier',email:'contact@charlier.be',phone:'+32 2 000 00 01',vat:'BE 0421.111.222',status:'validated',deferred_billing_enabled:true,shop_id:'bxl'},
      {id:2,tour_id:1,name:'Hôtel Nord — Économat',address:'Bd Baudouin 4',postal_code:'1000',city:'Bruxelles',contact:'Économe',email:'eco@hotelnord.be',phone:'+32 2 000 00 02',vat:'BE 0455.222.333',status:'validated',deferred_billing_enabled:true,shop_id:'bxl'},
      {id:3,tour_id:2,name:'Café des Arts — Salle',address:'Rue Royale 88',postal_code:'1000',city:'Bruxelles',contact:'Gérant',email:'contact@cafedesarts.be',phone:'+32 2 000 00 03',vat:'BE 0466.333.444',status:'pending',deferred_billing_enabled:false,shop_id:'bxl'},
      {id:4,tour_id:4,name:'KBC — Cafétéria HQ',address:'Havenlaan 2',postal_code:'3000',city:'Leuven',contact:'Facility',email:'facility@kbc.be',phone:'+32 16 00 00 04',vat:'BE 0403.227.515',status:'validated',deferred_billing_enabled:true,shop_id:'bxl'},
    ],
    // Liaison site ↔ département (un site n'expose que certains départements de la société)
    "ws_delivery_site_department": [
      {site_id:1,department_id:1},{site_id:1,department_id:2},
      {site_id:4,department_id:3},{site_id:4,department_id:4},{site_id:4,department_id:5},
      {site_id:2,department_id:6},
    ],
    // Rattachement départements ↔ delivery site ↔ office (cas B2B, clé = client_id).
    "b2b_client_company_department": [
      {id:1,id_client:'CL-0031',client_id:'CL-0031',company:'Boucherie Charlier',site:'Rue du Marché 12, 1000 BXL',office:'Siège',dept:'Production',name:'Production',effectif:8,contact:'prod@charlier.be'},
      {id:2,id_client:'CL-0031',client_id:'CL-0031',company:'Boucherie Charlier',site:'Rue du Marché 12, 1000 BXL',office:'Siège',dept:'Bureau',name:'Bureau',effectif:4,contact:'bureau@charlier.be'},
      {id:3,id_client:'CL-0071',client_id:'CL-0071',company:'KBC Group',site:'Havenlaan 2, 3000 Leuven',office:'Cafétéria HQ',dept:'Marketing',name:'Marketing',effectif:12,contact:'marketing@kbc.be'},
      {id:4,id_client:'CL-0071',client_id:'CL-0071',company:'KBC Group',site:'Havenlaan 2, 3000 Leuven',office:'Cafétéria HQ',dept:'Direction',name:'Direction',effectif:6,contact:'direction@kbc.be'},
      {id:5,id_client:'CL-0071',client_id:'CL-0071',company:'KBC Group',site:'Havenlaan 2, 3000 Leuven',office:'Cafétéria HQ',dept:'Accueil',name:'Accueil',effectif:3,contact:'accueil@kbc.be'},
      {id:6,id_client:'CL-0045',client_id:'CL-0045',company:'Hôtel Nord SA',site:'Bd Baudouin 4, 1000 BXL',office:'Économat',dept:'Cuisine',name:'Cuisine',effectif:10,contact:'chef@hotelnord.be'},
    ],
    "ws_office_delivery_settings": [
      {bureau:'Boucherie Charlier',tour:'Tournée Centre-ville',contrat:'Facturation différée',daysArr:[0,2,4],cut:'17:00 J-1',drop:8},
      {bureau:'Hôtel Nord SA',tour:'Tournée Centre-ville',contrat:'Contrat cadre',daysArr:[0,1,2,3,4],cut:'16:00 J-1',drop:14},
      {bureau:'Café des Arts',tour:'Tournée Uccle / Ixelles',contrat:'Comptant',daysArr:[1,3],cut:'17:00 J-1',drop:6},
    ],
    "ws_product_availability": [
      {produit:'Pièce montée sur commande',cat:'Pâtisserie fraîche',rule:'Sur devis'},
      {produit:'Bûche de Noël',cat:'Pâtisserie fraîche',rule:'Saisonnier'},
      {produit:'Plateau traiteur 20 p.',cat:'Traiteur / plats',rule:'Délai spécifique'},
    ],
    "ws_slots": [
      {mode:'Livraison',libelle:'Matin — dépôt avant midi',plage:'08:00 – 12:00',cap:40},
      {mode:'Livraison',libelle:'Après-midi',plage:'13:00 – 17:00',cap:35},
      {mode:'Retrait',libelle:'Journée continue',plage:'08:00 – 18:30',cap:60},
    ],
    "ws_office_emails": [
      {bureau:'Boucherie Charlier',addr:'contact@charlier.be',role:'Principal'},
      {bureau:'Boucherie Charlier',addr:'compta@charlier.be',role:'Facturation'},
      {bureau:'Hôtel Nord SA',addr:'achats@hotelnord.be',role:'Principal'},
      {bureau:'Hôtel Nord SA',addr:'finance@hotelnord.be',role:'Facturation'},
      {bureau:'Café des Arts',addr:'hello@cafedesarts.be',role:'Principal'},
    ],
    "ws_calendar_rules": [
      {mode:'Livraison',days:'Lun · Mar · Mer · Jeu · Ven',cut:'17:00 J-1',lead:'24 h'},
      {mode:'Retrait',days:'Lun–Sam',cut:'2 h avant',lead:'2 h'},
      {mode:'Express midi',days:'Lun–Ven',cut:'10:00 jour J',lead:'3 h'},
    ],
    "ws_pricing_rules_local": [
      {nom:'Happy hour −20 % (18–19h)',cible:'Boulangerie',effet:'−20 %',loc:true},
      {nom:'Prix marque — pâtisserie',cible:'Pâtisserie fraîche',effet:'Tarif réseau',loc:false},
      {nom:'Pack étudiant midi',cible:'Menus',effet:'8,90 €',loc:true},
    ],
    "ws_vouchers_local": [
      {code:'BXL10',valeur:'−10 % dès 40 €',type:'Panier',validite:"jusqu'au 31/08",loc:true},
      {code:'BIENVENUE',valeur:'Onboarding B2B',type:'add_office',validite:'permanent',loc:false},
      {code:'RENTREE',valeur:'−5 € dès 30 €',type:'Montant',validite:'sept.',loc:true},
    ],
    "ws_shop_exceptions": [
      {date:'24/12/2026',label:'Réveillon de Noël',type:'Horaire spécial',detail:'07:00 – 15:00 · pas de livraison PM'},
      {date:'25/12/2026',label:'Noël',type:'Fermé',detail:'Boutique fermée'},
      {date:'31/12/2026',label:'Saint-Sylvestre',type:'Horaire spécial',detail:'07:00 – 16:00'},
    ],
    "ws_payment_methods": [
      {nom:'Carte bancaire (Bancontact)',dw:true,dc:true,db:true},
      {nom:'Espèces',dw:false,dc:true,db:false},
      {nom:'Virement / facturation différée',dw:false,dc:false,db:true},
    ],
    // ---- Tables UI franchisé (ex-littéraux JSX, dé-hardcodés — PHASE B) ----
    "fr_tdb_tournees": [
      {nom:'Tournée Bruxelles-Centre',chauffeur:'Marek Kowalski',vehicule:'Renault Master frigo',nbPoints:4,colis:23,depart:'08:30',statut:'Prête'},
      {nom:'Tournée Uccle / Waterloo',chauffeur:'Julien Dubois',vehicule:'Iveco Daily',nbPoints:3,colis:8,depart:'09:15',statut:'En préparation'},
      {nom:'Tournée Etterbeek / Leuven',chauffeur:'Sofie Peeters',vehicule:'Renault Master',nbPoints:3,colis:13,depart:'09:45',statut:'En préparation'},
    ],
    "fr_tdb_tree": [
      {nom:'Tournée Bruxelles-Centre',chauffeur:'Marek Kowalski',statut:'Prête',zones:[
        {nom:'Bruxelles Centre',sites:[
          {libelle:'Brasserie Le Cirio',ville:'Grand-Place',cutoff:'08:00–11:00',office:'Le Cirio SA',users:[{nom:'Cuisine — M. Dupont',cmd:2},{nom:'Bar — S. Lefèvre',cmd:1}]},
          {libelle:'Maison Dandoy',ville:'Sablon',cutoff:'08:00–10:30',office:'Dandoy',users:[{nom:'Boutique Sablon',cmd:2}]},
        ]},
        {nom:'Sablon',sites:[
          {libelle:'Hôtel Amigo',ville:'Sablon',cutoff:'07:30–10:00',office:'Rocco Forte',users:[{nom:'Économat',cmd:2}]},
        ]},
        {nom:'Schaerbeek',sites:[
          {libelle:'Boulangerie du Parc',ville:'Schaerbeek',cutoff:'06:30–09:00',office:'Franchise BXL-N',users:[{nom:'Resp. magasin',cmd:1}]},
        ]},
      ]},
      {nom:'Tournée Uccle / Waterloo',chauffeur:'Julien Dubois',statut:'En préparation',zones:[
        {nom:'Uccle / Waterloo',sites:[
          {libelle:'Café Belga',ville:'Ixelles',cutoff:'09:00–11:30',office:'Belga SPRL',users:[{nom:'Gérant — J. Belga',cmd:2}]},
          {libelle:'Resto Le Chalet',ville:'Uccle',cutoff:'10:00–12:00',office:'Chalet SPRL',users:[{nom:'Chef de cuisine',cmd:1}]},
          {libelle:'Event Château',ville:'Waterloo',cutoff:'11:00–13:00',office:'Événements Sud',users:[{nom:'Traiteur événement',cmd:1}]},
        ]},
      ]},
      {nom:'Tournée Etterbeek / Leuven',chauffeur:'Sofie Peeters',statut:'En préparation',zones:[
        {nom:'Etterbeek / Leuven',sites:[
          {libelle:'Traiteur Delcourt',ville:'Etterbeek',cutoff:'08:00–10:00',office:'Delcourt',users:[{nom:'Atelier production',cmd:2}]},
          {libelle:'Corporate KBC',ville:'Leuven',cutoff:'07:00–09:00',office:'KBC Group',users:[{nom:'Cafétéria HQ',cmd:1}]},
        ]},
        {nom:'Anderlecht',sites:[
          {libelle:'Horeca Cureghem',ville:'Anderlecht',cutoff:'09:00–11:00',office:'Cureghem SPRL',users:[{nom:'Cuisine centrale',cmd:2}]},
        ]},
      ]},
    ],
    "fr_prep_points": [
      {ordre:1,libelle:'Brasserie Le Cirio',colisTxt:'8 colis · froid positif'},
      {ordre:2,libelle:'Hôtel Amigo',colisTxt:'6 colis · ambiant'},
      {ordre:3,libelle:'Maison Dandoy',colisTxt:'5 colis · ambiant'},
      {ordre:4,libelle:'Boulangerie du Parc',colisTxt:'4 colis · consigne bac'},
    ],
    "fr_live_eta": [
      {eta:'10:24',drift:"à l'heure",libelle:'Maison Dandoy',ville:'Sablon',statut:'En route'},
      {eta:'10:52',drift:'+6 min',libelle:'Boulangerie du Parc',ville:'Schaerbeek',statut:'En attente'},
      {eta:'11:30',drift:"à l'heure",libelle:'Café Belga',ville:'Ixelles',statut:'En attente'},
      {eta:'12:40',drift:'+18 min',libelle:'Event Château',ville:'Waterloo',statut:'Risque'},
    ],
    "fr_live_table": [
      {color:'#8D1D2C',nom:'Marek Kowalski',vehicule:'Renault Master frigo',tournee:'Centre',avancement:'3/4',next:'Maison Dandoy',nextVille:'Sablon',eta:'10:24',drift:"à l'heure",statut:'En route',stops:[
        {name:'Boulangerie du Sablon',ville:'Sablon',heure:'08:40',state:'done'},
        {name:'Hôtel Amigo',ville:'Grand-Place',heure:'09:15',state:'done',incident:true,incidentLabel:'Colis refusé — réception fermée'},
        {name:'Café Central',ville:'Bourse',heure:'09:52',state:'done'},
        {name:'Maison Dandoy',ville:'Sablon',heure:'10:24',state:'current'},
      ]},
      {color:'#3B3468',nom:'Julien Dubois',vehicule:'Iveco Daily',tournee:'Uccle',avancement:'1/3',next:'Event Château',nextVille:'Waterloo',eta:'12:40',drift:'+18 min',statut:'Risque',stops:[
        {name:'Restaurant Uccle',ville:'Uccle',heure:'11:20',state:'done'},
        {name:'Event Château',ville:'Waterloo',heure:'12:40',state:'current',incident:true,incidentLabel:'Retard +18 min — accès livraison bloqué'},
        {name:'Traiteur Sud',ville:'Rhode-Saint-Genèse',heure:'13:25',state:'todo'},
      ]},
      {color:'#2d7a3e',nom:'Sofie Peeters',vehicule:'Renault Master',tournee:'Etterbeek',avancement:'2/3',next:'Corporate KBC',nextVille:'Leuven',eta:'09:05',drift:'+5 min',statut:'En route',stops:[
        {name:'Bureau Etterbeek',ville:'Etterbeek',heure:'08:10',state:'done'},
        {name:'Clinique Sainte-Élisabeth',ville:'Uccle',heure:'08:40',state:'done'},
        {name:'Corporate KBC',ville:'Leuven',heure:'09:05',state:'current'},
      ]},
    ],
    "fr_renta_kpis": [
      {key:'kMarge',computed:'marge',delta:'▲ +7,2 % vs préc.'},
      {key:'kMargePct',value:'34 %',delta:'▲ +2,4 pts'},
      {key:'kCA',computed:'ca',delta:'▲ +4,1 %'},
      {key:'kCouts',computed:'couts',delta:'▲ +1,9 %',ok:false},
      {key:'kColis',value:'35,60 €',delta:'▼ −2,1 %'},
      {key:'kCAkm',value:'12,40 €',delta:'▲ +3,3 %'},
    ],
    "fr_cout_params": [
      {key:'prep',label:'Coût horaire préparation',effet:'01/06/2026',unit:'€/h',step:'0.5'},
      {key:'emb',label:'Coût emballage / colis',effet:'01/06/2026',unit:'€',step:'0.01'},
      {key:'carb',label:'Coût carburant / litre',effet:'01/07/2026',unit:'€/L',step:'0.01'},
      {key:'struct',label:'Coût structure / tournée',effet:'01/01/2026',unit:'€',step:'1'},
      {key:'charg',label:'Taux horaire chargement',effet:'01/06/2026',unit:'€/h',step:'0.5'},
    ],
    "fr_validations": [
      {id:'p1',init:'BC',raison:'Boucherie Charlier',email:'contact@charlier.be',segment:'retail',tva:'BE 0512.334.556',vies:'ok',date:'16 juil.'},
      {id:'p2',init:'TP',raison:'Traiteur Piotrowski',email:'zamowienia@piotrowski.pl',segment:'horeca',tva:'PL 5261040828',vies:'ok',date:'16 juil.'},
      {id:'p3',init:'HN',raison:'Hôtel Nord SA',email:'achats@hotelnord.be',segment:'corporate',tva:'BE 0455.09',vies:'invalid',date:'15 juil.'},
      {id:'p4',init:'EV',raison:'Événements Lumière',email:'info@evlumiere.be',segment:'event',tva:'BE 0788.221.994',vies:'pending',date:'15 juil.'},
      {id:'p5',init:'CB',raison:'Café des Arts',email:'gerant@cafedesarts.be',segment:'horeca',tva:'BE 0644.112.008',vies:'ok',date:'14 juil.'},
    ],
    "fr_dispo_cats": [
      {key:'trad',nom:'Pâtisserie fraîche',delai:'1',cut:'17:00',def:true},
      {key:'boul',nom:'Boulangerie',delai:'1',cut:'17:00',def:true},
      {key:'trait',nom:'Traiteur / plats',delai:'1',cut:'15:00',def:true},
      {key:'choc',nom:'Chocolaterie',delai:'2',cut:'17:00',def:true},
      {key:'glace',nom:'Glaces & surgelés',delai:'1',cut:'12:00',def:false},
      {key:'epic',nom:'Épicerie fine',delai:'2',cut:'17:00',def:true},
    ],
    "fr_stock_catalog": [
      {cat:'Boulangerie',catMand:true,prods:[
        {nom:'Baguette tradition',mand:true,online:28,shop:64,min:20},
        {nom:'Pain au chocolat',mand:false,online:15,shop:22,min:30},
        {nom:'Croissant beurre',mand:false,online:20,shop:0,min:25},
      ]},
      {cat:'Pâtisserie fraîche',catMand:false,prods:[
        {nom:'Éclair chocolat',mand:true,online:18,shop:12,min:10},
        {nom:'Tarte aux fraises',mand:false,online:0,shop:5,min:8},
      ]},
      {cat:'Chocolaterie',catMand:false,prods:[
        {nom:'Macarons (boîte 24)',mand:false,online:34,shop:26,min:15},
      ]},
      {cat:'Traiteur',catMand:false,prods:[
        {nom:'Quiche lorraine',mand:false,online:12,shop:8,min:10},
      ]},
      {cat:'Glaces',catMand:false,prods:[
        {nom:'Glace artisanale',mand:false,online:9,shop:14,min:12,defOff:true},
      ]},
    ],
    "fr_join_requests": [
      {id:'jr1',client:'Émilie Rousseau',demande:'« Rattacher à la Résidence Les Tilleuls »',proche:'Résidence Les Tilleuls (Av. Tervueren 50)',dup:true},
      {id:'jr3',client:'Sophie Laurent',demande:'« Rattacher à Café des Arts »',proche:'Café des Arts (Av. Louise 210)',dup:true},
      {id:'jr4',client:'Marc Vanden',demande:'« Rattacher à Boucherie Charlier »',proche:'Boucherie Charlier (Rue du Marché 12)',dup:false},
    ],
    "fr_assortiment": [
      {nom:'Baguette tradition',cat:'Boulangerie',locked:false,defA:true,defND:false},
      {nom:'Éclair chocolat',cat:'Pâtisserie fraîche',locked:true,defA:true,defND:false},
      {nom:'Foie gras mi-cuit',cat:'Traiteur',locked:false,defA:true,defND:true},
      {nom:'Macarons (24)',cat:'Chocolaterie',locked:false,defA:true,defND:false},
      {nom:'Bûche signature',cat:'Pâtisserie fraîche',locked:true,defA:true,defND:false},
      {nom:'Glace artisanale',cat:'Glaces',locked:false,defA:false,defND:true},
    ],
  };
  var DB = null;
  function read(){ try { var r = localStorage.getItem(LS); if (r) return JSON.parse(r); } catch(e){} return null; }
  function persist(){ try { localStorage.setItem(LS, JSON.stringify(DB)); } catch(e){} return DB; }
  function ensure(){ if (DB) return DB; DB = read(); if (!DB){ DB = JSON.parse(JSON.stringify(SEED)); } else { for (var k in SEED){ if (!(k in DB)) DB[k] = JSON.parse(JSON.stringify(SEED[k])); } } persist(); return DB; }
  // Écritures serveur : chaque BOServer.save(table) est poussé vers l'API.
  // Tables à mapping propre → écrites dans les vraies tables ; les autres →
  // journal serveur ws_bo_store (état du BO persisté côté serveur, plus
  // seulement localStorage). Best-effort : hors-ligne/401 ⇒ localStorage seul.
  function syncSave(n, rows){
    try {
      var fr = (typeof window !== 'undefined' && window.__FR) || {};
      if (!fr.base || !fr.token) return;
      fetch(fr.base + '/franchisee/save' + (fr.shop ? ('?shop=' + encodeURIComponent(fr.shop)) : ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': fr.token },
        credentials: 'omit',
        body: JSON.stringify({ table: n, rows: rows })
      }).catch(function(){});
    } catch(e){}
  }
  window.BOServer = {
    table: function(n){ var db = ensure(); return db[n] ? JSON.parse(JSON.stringify(db[n])) : []; },
    all: function(){ return JSON.parse(JSON.stringify(ensure())); },
    getParam: function(key, dflt){ var db = ensure(); var rows = db.params || []; for (var i=0;i<rows.length;i++){ if (rows[i].cle===key){ var r=rows[i]; return (r.val!==undefined ? r.val : (r.def!==undefined ? r.def : dflt)); } } return dflt; },
    setParam: function(key, val){ ensure(); var rows = DB.params || (DB.params = []); var found=false; for (var i=0;i<rows.length;i++){ if (rows[i].cle===key){ rows[i].val=val; found=true; } } if (!found) rows.push({cle:key, type:'bool', val:val}); syncSave('params', rows); return persist(); },
    save: function(n, rows){ ensure(); DB[n] = JSON.parse(JSON.stringify(rows)); syncSave(n, DB[n]); return persist(); },
    // Mise à jour LOCALE seulement (pas de syncSave) : utilisée pour refléter
    // en mémoire une donnée déjà écrite côté serveur (ex. office créé par le
    // toggle « livraison au bureau » — GET refetché puis injecté ici).
    refresh: function(n, rows){ ensure(); if (Array.isArray(rows)) DB[n] = JSON.parse(JSON.stringify(rows)); return persist(); },
    reset: function(){ DB = JSON.parse(JSON.stringify(SEED)); return persist(); },
    // Charge la vraie donnée depuis l'API PHP (/franchisee/*) EN MÉMOIRE, avec
    // repli seed par table : toute table absente/erreur/401/vide garde le seed,
    // donc le rendu ne casse jamais. Ne persiste pas l'API dans localStorage
    // (pas de cache périmé). À appeler AVANT le boot du runtime.
    // Miroir strict de bo_server.js (franchisor) → hydrate().
    hydrate: function(){
      var fr = (typeof window !== 'undefined' && window.__FR) || {};
      if (!fr.base) return Promise.resolve(false);
      ensure();
      var MAP = {
        kpis:'kpis',
        fr_clients:'fr-clients', fr_incidents:'fr-incidents', fr_alertes:'fr-alertes',
        fr_rentabilite:'fr-rentabilite', fr_live_drivers:'fr-live-drivers',
        ws_tours:'ws-tours', ws_delivery_zones:'ws-delivery-zones',
        ws_tour_postcodes:'ws-tour-postcodes', catchment_postcodes:'catchment-postcodes',
        ws_office_delivery_sites:'ws-office-delivery-sites', ws_offices:'ws-offices',
        ws_office_emails:'ws-office-emails', b2b_client_company_department:'b2b-departments',
        b2b_clients:'b2b-clients',
        ws_tour_availability:'ws-tour-availability', ws_tour_closures:'ws-tour-closures',
        ws_calendar_rules:'ws-calendar-rules', ws_slots:'ws-slots',
        ws_vouchers_local:'ws-vouchers-local', ws_pricing_rules_local:'ws-pricing-rules-local',
        ws_shop_exceptions:'ws-shop-exceptions', ws_payment_methods:'ws-payment-methods',
        ws_product_availability:'ws-product-availability',
        ws_office_delivery_settings:'ws-office-delivery-settings',
        ws_delivery_fee_rules:'ws-delivery-fee-rules',
        ws_franchisor_catchment:'ws-franchisor-catchment',
        params:'params',
        fr_tdb_tournees:'fr-tdb-tournees', fr_tdb_tree:'fr-tdb-tree',
        fr_prep_points:'fr-prep-points', fr_live_eta:'fr-live-eta', fr_live_table:'fr-live-table',
        fr_renta_kpis:'fr-renta-kpis', fr_cout_params:'fr-cout-params',
        fr_validations:'fr-validations', fr_dispo_cats:'fr-dispo-cats',
        fr_stock_catalog:'fr-stock-catalog', fr_join_requests:'fr-join-requests',
        fr_assortiment:'fr-assortiment'
      };
      var headers = fr.token ? { 'X-Admin-Token': fr.token } : {};
      var qs = fr.shop ? ('?shop=' + encodeURIComponent(fr.shop)) : '';
      // Tables à écriture TYPÉE (vraie table MySQL derrière /franchisee/save) :
      // pour elles, la réponse API fait foi MÊME VIDE (une table vidée reste
      // vide — le seed de démo ne doit pas « ressusciter » de lignes), et
      // l'overlay bo-store (copie potentiellement périmée) ne s'applique pas.
      // NB : fr_clients et ws_tour_availability restent HORS de ce set — leurs
      // écrans s'éditent via bo-store (pas de bloc typé aller-retour), les y
      // mettre ferait perdre les éditions au reload.
      var TYPED = { ws_tours:1, ws_delivery_zones:1, ws_tour_postcodes:1,
        ws_office_delivery_sites:1, ws_offices:1,
        ws_tour_closures:1, ws_franchisor_catchment:1,
        catchment_postcodes:1, b2b_client_company_department:1, params:1,
        b2b_clients:1 };
      var jobs = Object.keys(MAP).map(function(key){
        return fetch(fr.base + '/franchisee/' + MAP[key] + qs, { headers: headers, credentials: 'omit' })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(data){ if (Array.isArray(data) && (data.length || TYPED[key])) DB[key] = data; })
          .catch(function(){ /* garde le seed pour cette table */ });
      });
      return Promise.all(jobs).then(function(){
        // Overlay des éditions BO persistées côté serveur (ws_bo_store) :
        // priorité aux tables éditées via l'UI dont l'écriture n'est pas
        // (encore) typée vers une vraie table.
        return fetch(fr.base + '/franchisee/bo-store' + qs, { headers: headers, credentials: 'omit' })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(store){
            if (store && typeof store === 'object' && !Array.isArray(store)) {
              // Les tables TYPÉES viennent de la vraie table MySQL : l'overlay
              // bo-store (copie d'anciens enregistrements UI) ne doit pas les
              // écraser — c'est lui qui faisait « réapparaître » des sites.
              Object.keys(store).forEach(function(k){ if (Array.isArray(store[k]) && !TYPED[k]) DB[k] = store[k]; });
            }
            return true;
          })
          .catch(function(){ return true; });
      });
    }
  };
})();
