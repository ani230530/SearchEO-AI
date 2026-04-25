import React, { useState } from 'react';
import { ChevronDown, TrendingUp, Activity, Sparkles, Check, Plus, RefreshCcw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

// Country and States/Regions Data
const countryStatesData: Record<string, { label: string; states: { code: string; name: string }[] }> = {
  usa: {
    label: 'United States',
    states: [
      { code: 'al', name: 'Alabama' },
      { code: 'ak', name: 'Alaska' },
      { code: 'az', name: 'Arizona' },
      { code: 'ar', name: 'Arkansas' },
      { code: 'ca', name: 'California' },
      { code: 'co', name: 'Colorado' },
      { code: 'ct', name: 'Connecticut' },
      { code: 'de', name: 'Delaware' },
      { code: 'fl', name: 'Florida' },
      { code: 'ga', name: 'Georgia' },
      { code: 'hi', name: 'Hawaii' },
      { code: 'id', name: 'Idaho' },
      { code: 'il', name: 'Illinois' },
      { code: 'in', name: 'Indiana' },
      { code: 'ia', name: 'Iowa' },
      { code: 'ks', name: 'Kansas' },
      { code: 'ky', name: 'Kentucky' },
      { code: 'la', name: 'Louisiana' },
      { code: 'me', name: 'Maine' },
      { code: 'md', name: 'Maryland' },
      { code: 'ma', name: 'Massachusetts' },
      { code: 'mi', name: 'Michigan' },
      { code: 'mn', name: 'Minnesota' },
      { code: 'ms', name: 'Mississippi' },
      { code: 'mo', name: 'Missouri' },
      { code: 'mt', name: 'Montana' },
      { code: 'ne', name: 'Nebraska' },
      { code: 'nv', name: 'Nevada' },
      { code: 'nh', name: 'New Hampshire' },
      { code: 'nj', name: 'New Jersey' },
      { code: 'nm', name: 'New Mexico' },
      { code: 'ny', name: 'New York' },
      { code: 'nc', name: 'North Carolina' },
      { code: 'nd', name: 'North Dakota' },
      { code: 'oh', name: 'Ohio' },
      { code: 'ok', name: 'Oklahoma' },
      { code: 'or', name: 'Oregon' },
      { code: 'pa', name: 'Pennsylvania' },
      { code: 'ri', name: 'Rhode Island' },
      { code: 'sc', name: 'South Carolina' },
      { code: 'sd', name: 'South Dakota' },
      { code: 'tn', name: 'Tennessee' },
      { code: 'tx', name: 'Texas' },
      { code: 'ut', name: 'Utah' },
      { code: 'vt', name: 'Vermont' },
      { code: 'va', name: 'Virginia' },
      { code: 'wa', name: 'Washington' },
      { code: 'wv', name: 'West Virginia' },
      { code: 'wi', name: 'Wisconsin' },
      { code: 'wy', name: 'Wyoming' },
    ]
  },
  canada: {
    label: 'Canada',
    states: [
      { code: 'ab', name: 'Alberta' },
      { code: 'bc', name: 'British Columbia' },
      { code: 'mb', name: 'Manitoba' },
      { code: 'nb', name: 'New Brunswick' },
      { code: 'nl', name: 'Newfoundland and Labrador' },
      { code: 'ns', name: 'Nova Scotia' },
      { code: 'nt', name: 'Northwest Territories' },
      { code: 'nu', name: 'Nunavut' },
      { code: 'on', name: 'Ontario' },
      { code: 'pe', name: 'Prince Edward Island' },
      { code: 'qc', name: 'Quebec' },
      { code: 'sk', name: 'Saskatchewan' },
      { code: 'yt', name: 'Yukon' },
    ]
  },
  uk: {
    label: 'United Kingdom',
    states: [
      { code: 'eng', name: 'England' },
      { code: 'sct', name: 'Scotland' },
      { code: 'wal', name: 'Wales' },
      { code: 'nir', name: 'Northern Ireland' },
    ]
  },
  aus: {
    label: 'Australia',
    states: [
      { code: 'nsw', name: 'New South Wales' },
      { code: 'vic', name: 'Victoria' },
      { code: 'qld', name: 'Queensland' },
      { code: 'wa', name: 'Western Australia' },
      { code: 'sa', name: 'South Australia' },
      { code: 'tas', name: 'Tasmania' },
      { code: 'act', name: 'Australian Capital Territory' },
      { code: 'nt', name: 'Northern Territory' },
    ]
  },
  ind: {
    label: 'India',
    states: [
      { code: 'an', name: 'Andaman and Nicobar Islands' },
      { code: 'ap', name: 'Andhra Pradesh' },
      { code: 'ar', name: 'Arunachal Pradesh' },
      { code: 'as', name: 'Assam' },
      { code: 'br', name: 'Bihar' },
      { code: 'ct', name: 'Chhattisgarh' },
      { code: 'dd', name: 'Daman and Diu' },
      { code: 'dl', name: 'Delhi' },
      { code: 'ga', name: 'Goa' },
      { code: 'gj', name: 'Gujarat' },
      { code: 'hr', name: 'Haryana' },
      { code: 'hp', name: 'Himachal Pradesh' },
      { code: 'jk', name: 'Jammu and Kashmir' },
      { code: 'jh', name: 'Jharkhand' },
      { code: 'kl', name: 'Kerala' },
      { code: 'ka', name: 'Karnataka' },
      { code: 'mp', name: 'Madhya Pradesh' },
      { code: 'mh', name: 'Maharashtra' },
      { code: 'mn', name: 'Manipur' },
      { code: 'ml', name: 'Meghalaya' },
      { code: 'mz', name: 'Mizoram' },
      { code: 'nl', name: 'Nagaland' },
      { code: 'od', name: 'Odisha' },
      { code: 'py', name: 'Puducherry' },
      { code: 'pb', name: 'Punjab' },
      { code: 'rj', name: 'Rajasthan' },
      { code: 'sk', name: 'Sikkim' },
      { code: 'tn', name: 'Tamil Nadu' },
      { code: 'tg', name: 'Telangana' },
      { code: 'tr', name: 'Tripura' },
      { code: 'up', name: 'Uttar Pradesh' },
      { code: 'ut', name: 'Uttarakhand' },
      { code: 'wb', name: 'West Bengal' },
    ]
  },
  deu: {
    label: 'Germany',
    states: [
      { code: 'bw', name: 'Baden-Württemberg' },
      { code: 'by', name: 'Bavaria' },
      { code: 'be', name: 'Berlin' },
      { code: 'bb', name: 'Brandenburg' },
      { code: 'hb', name: 'Bremen' },
      { code: 'hh', name: 'Hamburg' },
      { code: 'he', name: 'Hesse' },
      { code: 'mv', name: 'Mecklenburg-Vorpommern' },
      { code: 'ni', name: 'Lower Saxony' },
      { code: 'nw', name: 'North Rhine-Westphalia' },
      { code: 'rp', name: 'Rhineland-Palatinate' },
      { code: 'sl', name: 'Saarland' },
      { code: 'sn', name: 'Saxony' },
      { code: 'st', name: 'Saxony-Anhalt' },
      { code: 'sh', name: 'Schleswig-Holstein' },
      { code: 'th', name: 'Thuringia' },
    ]
  },
  fra: {
    label: 'France',
    states: [
      { code: 'ile', name: 'Île-de-France' },
      { code: 'cvl', name: 'Centre-Val de Loire' },
      { code: 'bfc', name: 'Bourgogne-Franche-Comté' },
      { code: 'nor', name: 'Normandy' },
      { code: 'hdf', name: 'Hauts-de-France' },
      { code: 'gra', name: 'Grand Est' },
      { code: 'aqu', name: 'Nouvelle-Aquitaine' },
      { code: 'occ', name: 'Occitanie' },
      { code: 'ara', name: 'Auvergne-Rhône-Alpes' },
      { code: 'pac', name: 'Provence-Alpes-Côte d\'Azur' },
      { code: 'cor', name: 'Corsica' },
      { code: 'pdl', name: 'Pays de la Loire' },
      { code: 'bre', name: 'Brittany' },
    ]
  },
  jpn: {
    label: 'Japan',
    states: [
      { code: 'hokkaido', name: 'Hokkaido' },
      { code: 'aomori', name: 'Aomori' },
      { code: 'iwate', name: 'Iwate' },
      { code: 'miyagi', name: 'Miyagi' },
      { code: 'akita', name: 'Akita' },
      { code: 'yamagata', name: 'Yamagata' },
      { code: 'fukushima', name: 'Fukushima' },
      { code: 'ibaraki', name: 'Ibaraki' },
      { code: 'tochigi', name: 'Tochigi' },
      { code: 'gunma', name: 'Gunma' },
      { code: 'saitama', name: 'Saitama' },
      { code: 'chiba', name: 'Chiba' },
      { code: 'tokyo', name: 'Tokyo' },
      { code: 'kanagawa', name: 'Kanagawa' },
      { code: 'niigata', name: 'Niigata' },
      { code: 'toyama', name: 'Toyama' },
      { code: 'ishikawa', name: 'Ishikawa' },
      { code: 'fukui', name: 'Fukui' },
      { code: 'yamanashi', name: 'Yamanashi' },
      { code: 'nagano', name: 'Nagano' },
      { code: 'gifu', name: 'Gifu' },
      { code: 'shizuoka', name: 'Shizuoka' },
      { code: 'aichi', name: 'Aichi' },
      { code: 'mie', name: 'Mie' },
      { code: 'shiga', name: 'Shiga' },
      { code: 'kyoto', name: 'Kyoto' },
      { code: 'osaka', name: 'Osaka' },
      { code: 'hyogo', name: 'Hyogo' },
      { code: 'nara', name: 'Nara' },
      { code: 'wakayama', name: 'Wakayama' },
      { code: 'tottori', name: 'Tottori' },
      { code: 'shimane', name: 'Shimane' },
      { code: 'okayama', name: 'Okayama' },
      { code: 'hiroshima', name: 'Hiroshima' },
      { code: 'yamaguchi', name: 'Yamaguchi' },
      { code: 'tokushima', name: 'Tokushima' },
      { code: 'kagawa', name: 'Kagawa' },
      { code: 'ehime', name: 'Ehime' },
      { code: 'kochi', name: 'Kochi' },
      { code: 'fukuoka', name: 'Fukuoka' },
      { code: 'saga', name: 'Saga' },
      { code: 'nagasaki', name: 'Nagasaki' },
      { code: 'kumamoto', name: 'Kumamoto' },
      { code: 'oita', name: 'Oita' },
      { code: 'miyazaki', name: 'Miyazaki' },
      { code: 'kagoshima', name: 'Kagoshima' },
      { code: 'okinawa', name: 'Okinawa' },
    ]
  },
  chn: {
    label: 'China',
    states: [
      { code: 'beijing', name: 'Beijing' },
      { code: 'tianjin', name: 'Tianjin' },
      { code: 'hebei', name: 'Hebei' },
      { code: 'shanxi', name: 'Shanxi' },
      { code: 'inner', name: 'Inner Mongolia' },
      { code: 'liaoning', name: 'Liaoning' },
      { code: 'jilin', name: 'Jilin' },
      { code: 'heilongjiang', name: 'Heilongjiang' },
      { code: 'shanghai', name: 'Shanghai' },
      { code: 'jiangsu', name: 'Jiangsu' },
      { code: 'zhejiang', name: 'Zhejiang' },
      { code: 'anhui', name: 'Anhui' },
      { code: 'fujian', name: 'Fujian' },
      { code: 'jiangxi', name: 'Jiangxi' },
      { code: 'shandong', name: 'Shandong' },
      { code: 'henan', name: 'Henan' },
      { code: 'hubei', name: 'Hubei' },
      { code: 'hunan', name: 'Hunan' },
      { code: 'guangdong', name: 'Guangdong' },
      { code: 'guangxi', name: 'Guangxi' },
      { code: 'hainan', name: 'Hainan' },
      { code: 'chongqing', name: 'Chongqing' },
      { code: 'sichuan', name: 'Sichuan' },
      { code: 'guizhou', name: 'Guizhou' },
      { code: 'yunnan', name: 'Yunnan' },
      { code: 'tibet', name: 'Tibet' },
      { code: 'shaanxi', name: 'Shaanxi' },
      { code: 'gansu', name: 'Gansu' },
      { code: 'qinghai', name: 'Qinghai' },
      { code: 'ningxia', name: 'Ningxia' },
      { code: 'xinjiang', name: 'Xinjiang' },
    ]
  },
  bra: {
    label: 'Brazil',
    states: [
      { code: 'acre', name: 'Acre' },
      { code: 'alagoas', name: 'Alagoas' },
      { code: 'amapa', name: 'Amapá' },
      { code: 'amazonas', name: 'Amazonas' },
      { code: 'bahia', name: 'Bahia' },
      { code: 'ceara', name: 'Ceará' },
      { code: 'df', name: 'Federal District' },
      { code: 'espirito', name: 'Espírito Santo' },
      { code: 'goias', name: 'Goiás' },
      { code: 'maranhao', name: 'Maranhão' },
      { code: 'mato', name: 'Mato Grosso' },
      { code: 'mato_sul', name: 'Mato Grosso do Sul' },
      { code: 'minas', name: 'Minas Gerais' },
      { code: 'para', name: 'Pará' },
      { code: 'paraiba', name: 'Paraíba' },
      { code: 'parana', name: 'Paraná' },
      { code: 'pernambuco', name: 'Pernambuco' },
      { code: 'piaui', name: 'Piauí' },
      { code: 'rj', name: 'Rio de Janeiro' },
      { code: 'rn', name: 'Rio Grande do Norte' },
      { code: 'rs', name: 'Rio Grande do Sul' },
      { code: 'ro', name: 'Rondônia' },
      { code: 'rr', name: 'Roraima' },
      { code: 'sp', name: 'São Paulo' },
      { code: 'sc', name: 'Santa Catarina' },
      { code: 'se', name: 'Sergipe' },
      { code: 'to', name: 'Tocantins' },
    ]
  },
  mex: {
    label: 'Mexico',
    states: [
      { code: 'ag', name: 'Aguascalientes' },
      { code: 'bcs', name: 'Baja California Sur' },
      { code: 'bc', name: 'Baja California' },
      { code: 'cam', name: 'Campeche' },
      { code: 'coah', name: 'Coahuila' },
      { code: 'col', name: 'Colima' },
      { code: 'chis', name: 'Chiapas' },
      { code: 'chih', name: 'Chihuahua' },
      { code: 'cdmx', name: 'Mexico City' },
      { code: 'dgo', name: 'Durango' },
      { code: 'gto', name: 'Guanajuato' },
      { code: 'gro', name: 'Guerrero' },
      { code: 'hgo', name: 'Hidalgo' },
      { code: 'jal', name: 'Jalisco' },
      { code: 'edomex', name: 'Mexico State' },
      { code: 'mich', name: 'Michoacán' },
      { code: 'mor', name: 'Morelos' },
      { code: 'nay', name: 'Nayarit' },
      { code: 'oel', name: 'Nuevo León' },
      { code: 'oax', name: 'Oaxaca' },
      { code: 'pue', name: 'Puebla' },
      { code: 'qro', name: 'Querétaro' },
      { code: 'qroo', name: 'Quintana Roo' },
      { code: 'slp', name: 'San Luis Potosí' },
      { code: 'sin', name: 'Sinaloa' },
      { code: 'son', name: 'Sonora' },
      { code: 'tab', name: 'Tabasco' },
      { code: 'tam', name: 'Tamaulipas' },
      { code: 'tlax', name: 'Tlaxcala' },
      { code: 'ver', name: 'Veracruz' },
      { code: 'yuc', name: 'Yucatán' },
      { code: 'zac', name: 'Zacatecas' },
    ]
  },
  zaf: {
    label: 'South Africa',
    states: [
      { code: 'ec', name: 'Eastern Cape' },
      { code: 'fs', name: 'Free State' },
      { code: 'gp', name: 'Gauteng' },
      { code: 'kzn', name: 'KwaZulu-Natal' },
      { code: 'lp', name: 'Limpopo' },
      { code: 'mp', name: 'Mpumalanga' },
      { code: 'nc', name: 'Northern Cape' },
      { code: 'nw', name: 'North West' },
      { code: 'wc', name: 'Western Cape' },
    ]
  },
  ita: {
    label: 'Italy',
    states: [
      { code: 'ag', name: 'Agrigento' },
      { code: 'al', name: 'Alessandria' },
      { code: 'an', name: 'Ancona' },
      { code: 'ao', name: 'Aosta Valley' },
      { code: 'ap', name: 'Ascoli Piceno' },
      { code: 'at', name: 'Asti' },
      { code: 'av', name: 'Avellino' },
      { code: 'ba', name: 'Bari' },
      { code: 'bl', name: 'Belluno' },
      { code: 'bn', name: 'Benevento' },
      { code: 'bg', name: 'Bergamo' },
      { code: 'bi', name: 'Biella' },
      { code: 'bo', name: 'Bologna' },
      { code: 'bz', name: 'Bolzano' },
      { code: 'bs', name: 'Brescia' },
      { code: 'br', name: 'Brindisi' },
      { code: 'ca', name: 'Cagliari' },
      { code: 'cl', name: 'Caltanissetta' },
      { code: 'cb', name: 'Campobasso' },
      { code: 'ce', name: 'Caserta' },
      { code: 'ct', name: 'Catania' },
      { code: 'cz', name: 'Catanzaro' },
      { code: 'ch', name: 'Chieti' },
      { code: 'co', name: 'Como' },
      { code: 'cs', name: 'Cosenza' },
      { code: 'cr', name: 'Cremona' },
      { code: 'kr', name: 'Crotone' },
      { code: 'cn', name: 'Cuneo' },
      { code: 'en', name: 'Enna' },
      { code: 'fc', name: 'Forlì-Cesena' },
      { code: 'fe', name: 'Ferrara' },
      { code: 'fi', name: 'Florence' },
      { code: 'fg', name: 'Foggia' },
      { code: 'fr', name: 'Frosinone' },
      { code: 'ge', name: 'Genoa' },
      { code: 'go', name: 'Gorizia' },
      { code: 'gr', name: 'Grosseto' },
      { code: 'im', name: 'Imperia' },
      { code: 'is', name: 'Isernia' },
      { code: 'sp', name: 'La Spezia' },
      { code: 'aq', name: 'L\'Aquila' },
      { code: 'lt', name: 'Latina' },
      { code: 'le', name: 'Lecce' },
      { code: 'lc', name: 'Lecco' },
      { code: 'li', name: 'Livorno' },
      { code: 'lo', name: 'Lodi' },
      { code: 'lu', name: 'Lucca' },
      { code: 'mc', name: 'Macerata' },
      { code: 'mn', name: 'Mantua' },
      { code: 'ms', name: 'Massa and Carrara' },
      { code: 'mt', name: 'Matera' },
      { code: 'me', name: 'Messina' },
      { code: 'mi', name: 'Milan' },
      { code: 'mo', name: 'Modena' },
      { code: 'mb', name: 'Monza and Brianza' },
      { code: 'na', name: 'Naples' },
      { code: 'no', name: 'Novara' },
      { code: 'nu', name: 'Nuoro' },
      { code: 'or', name: 'Oristano' },
      { code: 'pd', name: 'Padua' },
      { code: 'pa', name: 'Palermo' },
      { code: 'pr', name: 'Parma' },
      { code: 'pv', name: 'Pavia' },
      { code: 'pg', name: 'Perugia' },
      { code: 'pe', name: 'Pescara' },
      { code: 'pz', name: 'Potenza' },
      { code: 'pi', name: 'Pisa' },
      { code: 'pt', name: 'Pistoia' },
      { code: 'pn', name: 'Pordenone' },
      { code: 'po', name: 'Prato' },
      { code: 'rc', name: 'Reggio Calabria' },
      { code: 're', name: 'Reggio Emilia' },
      { code: 'ri', name: 'Rieti' },
      { code: 'rn', name: 'Rimini' },
      { code: 'rm', name: 'Rome' },
      { code: 'ro', name: 'Rovigo' },
      { code: 'sa', name: 'Salerno' },
      { code: 'ss', name: 'Sassari' },
      { code: 'sv', name: 'Savona' },
      { code: 'si', name: 'Siena' },
      { code: 'sr', name: 'Syracuse' },
      { code: 'so', name: 'Sondrio' },
      { code: 'ta', name: 'Taranto' },
      { code: 'te', name: 'Teramo' },
      { code: 'tr', name: 'Terni' },
      { code: 'to', name: 'Turin' },
      { code: 'tp', name: 'Trapani' },
      { code: 'tv', name: 'Treviso' },
      { code: 'ts', name: 'Trieste' },
      { code: 'ud', name: 'Udine' },
      { code: 'va', name: 'Varese' },
      { code: 'vb', name: 'Verbano-Cusio-Ossola' },
      { code: 'vc', name: 'Vercelli' },
      { code: 'vr', name: 'Verona' },
      { code: 've', name: 'Venice' },
      { code: 'vi', name: 'Vicenza' },
      { code: 'vt', name: 'Viterbo' },
    ]
  },
};

const stepItems = [
  { id: 'compare', type: 'prompt', label: 'Compare Semrush, Ahrefs, AthenaHQ in AI results' },
  { id: 'best-tool', type: 'prompt', label: 'Best tool in seo and geo' },
  { id: 'seo-platform', type: 'keyword', label: 'SEO tools platform' },
  { id: 'research-software', type: 'keyword', label: 'keyword research software' },
  { id: 'digital-analytics', type: 'keyword', label: 'digital marketing analytics' },
  { id: 'audit-software', type: 'keyword', label: 'SEO audit software' },
];

const AIChecker = () => {
  const [domain, setDomain] = useState('');
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [industry, setIndustry] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customKeywords, setCustomKeywords] = useState('');
  const [keywordTags, setKeywordTags] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>(['gpt4']);
  const [selectedTab, setSelectedTab] = useState<'all' | 'prompt' | 'keyword'>('all');
  const [selectedStepItems, setSelectedStepItems] = useState<string[]>([]);
  const [step, setStep] = useState(1);
  const [competitors, setCompetitors] = useState([
    { id: 'semrush', name: 'Semrush', url: 'https://semrush.com', icon: '/semrush-icon.png' },
    { id: 'ahrefs', name: 'Ahref', url: 'https://app.ahrefs.com', icon: '/ahref-icon.png' },
    { id: 'athena', name: 'Athena HQ', url: 'https://athenahq.ai', icon: '/athena-hq.png' },
  ]);
  const [newCompetitor, setNewCompetitor] = useState('');

  const models = [
    { id: 'gpt4', icon: '/chatgpt.png' },
    { id: 'claude', icon: '/claude.png' },
    { id: 'gemini', icon: '/gemini.png' },
    { id: 'custom', icon: '+' },
  ];

  const handleRemoveTag = (tag: string) => {
    setKeywordTags(keywordTags.filter(t => t !== tag));
  };

  const handleAddTag = () => {
    if (customKeywords.trim()) {
      const newKeywords = customKeywords
        .split(',')
        .map(keyword => keyword.trim())
        .filter(keyword => keyword && !keywordTags.includes(keyword));
      
      if (newKeywords.length > 0) {
        setKeywordTags([...keywordTags, ...newKeywords]);
        setCustomKeywords('');
      }
    }
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const toggleModel = (modelId: string) => {
    if (modelId === 'custom') return; // Handle custom model addition separately
    setSelectedModels(prev =>
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  const getFilteredStepItems = () => {
    if (selectedTab === 'all') return stepItems;
    return stepItems.filter((item) => item.type === selectedTab);
  };

  const toggleStepItem = (id: string) => {
    setSelectedStepItems((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const handleAutoSelectAll = () => {
    setSelectedStepItems(stepItems.map((item) => item.id));
  };

  // Get available states for selected country
  const getStateOptions = () => {
    if (!country || !countryStatesData[country]) {
      return [];
    }
    return countryStatesData[country].states;
  };

  // Handle country change and reset state
  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCountry(e.target.value);
    setState(''); // Reset state when country changes
  };

  // Mock data for charts
  const chartData = [
    { month: 'Jan', customers: 2000 },
    { month: 'Feb', customers: 2100 },
    { month: 'Mar', customers: 2050 },
    { month: 'Apr', customers: 2300 },
    { month: 'May', customers: 2420 },
  ];

  const performanceData = [
    { name: 'On-page SEO', value: 85, fill: '#3b82f6' },
    { name: 'Technical', value: 72, fill: '#10b981' },
    { name: 'Speed', value: 65, fill: '#f59e0b' },
    { name: 'Mobile', value: 92, fill: '#8b5cf6' },
  ];

  const handleToggleCompetitor = (id: string) => {
    setCompetitors((prev) =>
      prev.map((competitor) =>
        competitor.id === id ? { ...competitor, selected: !competitor.selected } : competitor
      )
    );
  };

  const handleAddCompetitor = () => {
    const trimmed = newCompetitor.trim();
    if (!trimmed) return;

    setCompetitors((prev) => [
      ...prev,
      { id: `${trimmed}-${Date.now()}`, name: trimmed, url: trimmed.startsWith('http') ? trimmed : `https://${trimmed}`, selected: true },
    ]);
    setNewCompetitor('');
  };

  const handleContinue = () => {
    if (step === 1) {
      setStep(2);
      return;
    }

    if (step === 2) {
      setStep(3);
      return;
    }

    const selectedCompetitors = competitors.filter((competitor) => competitor.selected);
    console.log({ domain, country, state, industry, selectedCompetitors, selectedStepItems });
  };

  const handleStepClick = (targetStep: number) => {
    if (targetStep <= 3) {
      setStep(targetStep);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Loading indicator */}
      <div className="pt-8 px-[8%]">
        <div className="flex gap-2 w-full max-w-xs ml-6">
          {[1, 2, 3].map((index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleStepClick(index)}
              className="flex-1"
            >
              <div
                className={`h-1 rounded transition ${step >= index ? 'bg-blue-500' : 'bg-slate-300'}`}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-12 px-6 py-12 max-w-7xl mx-auto">
        {/* Left Section - Form */}
        <div className="w-1/2 max-w-none">
          {step === 1 ? (
            <>
              <div className="mb-8">
                <p className="text-sm font-medium text-blue-600 mb-2">Get to know us</p>
                <h1 className="text-4xl font-bold text-slate-900 mb-3">Add your domain</h1>
                <p className="text-slate-600 text-sm leading-relaxed">
                  We will analyze your public pages to pre-fill your brand profile. You can review and edit everything.
                </p>
              </div>

              {/* Form */}
              <div className="space-y-6">
                {/* Domain Input */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Enter URL</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400"><img src='/domain-icon.png'/></span>
                    <input
                      type="text"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="domain.com"
                      className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Country and State */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Country</label>
                    <div className="relative">
                      <select
                        value={country}
                        onChange={handleCountryChange}
                        className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select Country</option>
                        {Object.entries(countryStatesData).map(([code, data]) => (
                          <option key={code} value={code}>
                            {data.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">State/Region</label>
                    <div className="relative">
                      <select
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        disabled={!country}
                        className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        <option value="">Select State/Region</option>
                        {getStateOptions().map((stateOption) => (
                          <option key={stateOption.code} value={stateOption.code}>
                            {stateOption.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Industry */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Industry</label>
                  <div className="relative">
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select Industry</option>
                      <option value="tech">Agriculture</option>
                      <option value="finance">Mining & Quarrying</option>
                      <option value="ecommerce">Manufacturing</option>
                      <option value="tech">Construction</option>
                      <option value="finance">Technology & IT</option>
                      <option value="ecommerce">Healthcare & Pharmaceuticals</option>
                      <option value="tech">Financial Services & Insurance</option>
                      <option value="finance">Energy & Utilities</option>
                      <option value="ecommerce">Transportation & Logistics</option>
                      <option value="tech">Telecommunications</option>
                      <option value="finance">Education & Training</option>
                      <option value="ecommerce">Hospitality & Tourism</option>
                      <option value="tech">Media & Entertainment</option>
                      <option value="finance">Retail & Consumer Goods</option>
                      <option value="ecommerce">Aerospace & Defense</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Advanced Options */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Advanced Options
                    <ChevronDown className={`h-4 w-4 transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Advanced Options Content */}
                  {showAdvanced && (
                    <div className="border-t border-slate-200 p-4 bg-slate-50 space-y-6">
                      {/* Add custom Keywords/Prompt */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 mb-3">Add custom Keywords/Prompt</h3>
                        <div className="space-y-2">
                          {/* Tags Display */}
                          <div className="flex flex-wrap gap-2 mb-3">
                            {keywordTags.map((tag) => (
                              <div
                                key={tag}
                                className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium"
                              >
                                {tag}
                                <button
                                  onClick={() => handleRemoveTag(tag)}
                                  className="text-blue-700 hover:text-blue-900"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                          {/* Keyword Input */}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={customKeywords}
                              onChange={(e) => setCustomKeywords(e.target.value)}
                              onKeyDown={handleKeywordKeyDown}
                              placeholder="Enter keywords/prompts separated by commas"
                              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                            <button
                              onClick={handleAddTag}
                              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                            >
                              Add
                            </button>
                          </div>
                          <p className="text-xs text-slate-500 mt-2">
                            Enter keywords/Prompts separated by commas. These will be analyzed with AI and added to your analysis.
                          </p>
                        </div>
                      </div>

                      {/* Select Model preferences */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 mb-3">Select Model preferences</h3>
                        <div className="grid grid-cols-4 gap-5 justify-items-center">
                          {models.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => toggleModel(model.id)}
                              aria-label={model.name}
                              className="w-14 h-14 flex items-center justify-center"
                            >
                              {model.id === 'custom' ? (
                                <span className="text-2xl">{model.icon}</span>
                              ) : (
                                <img src={model.icon} alt={model.name} className="w-10 h-10 object-contain" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : step === 2 ? (
            <>
              <div className="mb-8">
                <p className="text-sm font-medium text-blue-600 mb-2">Get to know us</p>
                <h1 className="text-4xl font-bold text-slate-900 mb-3">Track Your Competitors in AI Search</h1>
                <p className="text-slate-600 text-sm leading-relaxed">
                  List at least 3–5 competitors relevant to your space for more accurate comparison.
                </p>
              </div>

              <div className="space-y-6">
                <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="space-y-4">
                    {competitors.map((competitor) => (
                      <button
                        key={competitor.id}
                        type="button"
                        onClick={() => handleToggleCompetitor(competitor.id)}
                        className={`w-full flex items-center justify-between gap-4 rounded-3xl border px-4 py-4 text-left transition ${competitor.selected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                      >
                        <div className="flex items-center gap-4">
                          <span className={`flex h-5 w-5 items-center justify-center rounded-sm border ${competitor.selected ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <div className="flex items-center justify-center">
                            <img src={competitor.icon} alt={`${competitor.name} logo`} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{competitor.name}</p>
                            <p className="truncate text-sm text-slate-500">{competitor.url}</p>
                          </div>
                        </div>
                        <a
                          href={competitor.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-blue-600 truncate"
                        >
                          {competitor.url}
                        </a>
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 rounded-[10px] border border-dashed border-slate-300 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3 ">
                      <input
                        type="text"
                        value={newCompetitor}
                        onChange={(e) => setNewCompetitor(e.target.value)}
                        placeholder="Add Competitor"
                        className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddCompetitor}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Add competitor domains that matter most to your industry.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="mb-8">
                <p className="text-sm font-medium text-blue-600 mb-2">Select for precise results</p>
                <h1 className="text-4xl font-bold text-slate-900 mb-3">Select prompts & keywords in your niche</h1>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Choose the most relevant queries to help AI understand what you want to track and optimize.
                </p>
              </div>

              <div className="mb-6 flex flex-wrap items-center gap-3">
             <div className="flex items-center gap-4 ">
  {['all', 'prompt', 'keyword'].map((tab) => (
    <button
      key={tab}
      type="button"
      onClick={() => setSelectedTab(tab as 'all' | 'prompt' | 'keyword')}
      className={`px-5 py-2 text-base font-semibold rounded-full transition ${
        selectedTab === tab
          ? 'bg-[#c7d6f2] text-[#2d4059]'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {tab === 'all' ? 'All' : tab === 'prompt' ? 'Prompts' : 'Keywords'}
    </button>
  ))}
</div>
                <button
                  type="button"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleAutoSelectAll}
                  className="inline-flex items-center gap-2 rounded-[12px] px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
                  style={{
                    background: "linear-gradient(90deg, rgb(45, 64, 89) 0%, rgb(78, 118, 199) 100%)"
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  Auto-select (all)
                </button>
              </div>

              <div className="space-y-3">
                {getFilteredStepItems().map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleStepItem(item.id)}
                    className={`w-full flex items-center justify-between gap-4 rounded-[8px] border px-4 py-4 text-left transition ${selectedStepItems.includes(item.id) ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-lg border ${selectedStepItems.includes(item.id) ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-900 truncate">{item.label}</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                      {item.type === 'prompt' ? 'Prompt' : 'Keyword'}
                    </span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <button
                  type="button"
                  className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-5 py-4 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Add Custom prompt
                  <Plus className="ml-2 inline-block h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-5 py-4 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Add Custom Keywords
                  <Plus className="ml-2 inline-block h-4 w-4" />
                </button>
              </div>
            </>
          )}

          <div className="mt-6 flex flex-col gap-3">
            {/* {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                ← Back
              </button>
            )} */}

            <button
              onClick={handleContinue}
              className="w-full rounded-[10px] bg-slate-400 px-4 py-4 text-sm font-semibold text-white hover:bg-slate-500 transition-colors flex items-center justify-center gap-2"
            >
              {step < 3 ? 'Continue' : 'Generate report'}
              <span>→</span>
            </button>
            {step === 3 && (
              <p className="text-center text-xs text-slate-500">{selectedStepItems.length} Keywords Selected</p>
            )}
          </div>
        </div>

        {/* Right Section - Dashboard Cards */}
        <div className="w-1/2 space-y-6">
          <div className="mb-6">
            <img src="/ai-checker.png" alt="AI Checker" className="w-full h-auto rounded-lg shadow-sm" />
          </div>

          {/* {step === 2 && (
          
          )} */}
        </div>
      </div>
    </div>
  );
};

export default AIChecker;
