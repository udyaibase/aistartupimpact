export interface CityEntry {
  city: string;
  state?: string;
  country: string;
  lat?: number;
  lng?: number;
  aliases?: string[];
}

export const CITY_DATABASE: CityEntry[] = [
// ═══════════════════════════════════════════════════════════
  // INDIA
  // ═══════════════════════════════════════════════════════════
 
  // ─── Andhra Pradesh ───
  { city: "Visakhapatnam", state: "Andhra Pradesh", country: "India", lat: 17.6868, lng: 83.2185, aliases: ["vizag", "vishakapatnam"] },
  { city: "Vijayawada", state: "Andhra Pradesh", country: "India", lat: 16.5062, lng: 80.648, aliases: ["bezawada"] },
  { city: "Guntur", state: "Andhra Pradesh", country: "India", lat: 16.3067, lng: 80.4365, aliases: [] },
  { city: "Nellore", state: "Andhra Pradesh", country: "India", lat: 14.4426, lng: 79.9865, aliases: [] },
  { city: "Kurnool", state: "Andhra Pradesh", country: "India", lat: 15.8281, lng: 78.0373, aliases: [] },
  { city: "Rajahmundry", state: "Andhra Pradesh", country: "India", lat: 17.0005, lng: 81.8040, aliases: ["rajamahendravaram", "rajamundry"] },
  { city: "Tirupati", state: "Andhra Pradesh", country: "India", lat: 13.6288, lng: 79.4192, aliases: ["tirupathi"] },
  { city: "Kadapa", state: "Andhra Pradesh", country: "India", lat: 14.4674, lng: 78.8241, aliases: ["cuddapah"] },
  { city: "Kakinada", state: "Andhra Pradesh", country: "India", lat: 16.9891, lng: 82.2475, aliases: ["cocanada"] },
  { city: "Anantapur", state: "Andhra Pradesh", country: "India", lat: 14.6819, lng: 77.6006, aliases: ["anantapuram"] },
  { city: "Ongole", state: "Andhra Pradesh", country: "India", lat: 15.5057, lng: 80.0499, aliases: [] },
  { city: "Eluru", state: "Andhra Pradesh", country: "India", lat: 16.7107, lng: 81.0952, aliases: [] },
  { city: "Chittoor", state: "Andhra Pradesh", country: "India", lat: 13.2172, lng: 79.1003, aliases: [] },
  { city: "Srikakulam", state: "Andhra Pradesh", country: "India", lat: 18.2949, lng: 83.8938, aliases: [] },
  { city: "Machilipatnam", state: "Andhra Pradesh", country: "India", lat: 16.1875, lng: 81.1389, aliases: ["masulipatnam", "bandar"] },
  { city: "Tenali", state: "Andhra Pradesh", country: "India", lat: 16.2380, lng: 80.6400, aliases: [] },
  { city: "Proddatur", state: "Andhra Pradesh", country: "India", lat: 14.7502, lng: 78.5480, aliases: [] },
  { city: "Adoni", state: "Andhra Pradesh", country: "India", lat: 15.6322, lng: 77.2773, aliases: [] },
  { city: "Nandyal", state: "Andhra Pradesh", country: "India", lat: 15.4776, lng: 78.4836, aliases: [] },
  { city: "Amaravati", state: "Andhra Pradesh", country: "India", lat: 16.5131, lng: 80.5088, aliases: [] },
  { city: "Vizianagaram", state: "Andhra Pradesh", country: "India", lat: 18.1067, lng: 83.3956, aliases: [] },
  { city: "Hindupur", state: "Andhra Pradesh", country: "India", lat: 13.8286, lng: 77.4918, aliases: [] },
  { city: "Bhimavaram", state: "Andhra Pradesh", country: "India", lat: 16.5449, lng: 81.5212, aliases: [] },
  { city: "Tadepalligudem", state: "Andhra Pradesh", country: "India", lat: 16.8144, lng: 81.5270, aliases: [] },
  { city: "Tadipatri", state: "Andhra Pradesh", country: "India", lat: 15.1755, lng: 78.0094, aliases: [] },
  { city: "Chilakaluripet", state: "Andhra Pradesh", country: "India", lat: 16.0892, lng: 80.1672, aliases: [] },
  { city: "Narasaraopet", state: "Andhra Pradesh", country: "India", lat: 16.2346, lng: 80.0478, aliases: [] },
  { city: "Kavali", state: "Andhra Pradesh", country: "India", lat: 14.9164, lng: 79.9939, aliases: [] },
  { city: "Gudivada", state: "Andhra Pradesh", country: "India", lat: 16.4348, lng: 80.9932, aliases: [] },
  { city: "Markapur", state: "Andhra Pradesh", country: "India", lat: 15.7354, lng: 79.2692, aliases: [] },
  { city: "Dharmavaram", state: "Andhra Pradesh", country: "India", lat: 14.4143, lng: 77.7158, aliases: [] },
  { city: "Gudur", state: "Andhra Pradesh", country: "India", lat: 14.1480, lng: 79.8500, aliases: [] },
  { city: "Narasapuram", state: "Andhra Pradesh", country: "India", lat: 16.4333, lng: 81.7000, aliases: [] },
 
  // ─── Arunachal Pradesh ───
  { city: "Itanagar", state: "Arunachal Pradesh", country: "India", lat: 27.0844, lng: 93.6053, aliases: [] },
  { city: "Naharlagun", state: "Arunachal Pradesh", country: "India", lat: 27.1045, lng: 93.6942, aliases: [] },
  { city: "Pasighat", state: "Arunachal Pradesh", country: "India", lat: 28.0660, lng: 95.3269, aliases: [] },
  { city: "Tawang", state: "Arunachal Pradesh", country: "India", lat: 27.5860, lng: 91.8687, aliases: [] },
  { city: "Ziro", state: "Arunachal Pradesh", country: "India", lat: 27.5445, lng: 93.8311, aliases: [] },
  { city: "Bomdila", state: "Arunachal Pradesh", country: "India", lat: 27.2645, lng: 92.4240, aliases: [] },
  { city: "Along", state: "Arunachal Pradesh", country: "India", lat: 28.1700, lng: 94.7600, aliases: [] },
  { city: "Tezu", state: "Arunachal Pradesh", country: "India", lat: 27.9200, lng: 96.1700, aliases: [] },
 
  // ─── Assam ───
  { city: "Guwahati", state: "Assam", country: "India", lat: 26.1445, lng: 91.7362, aliases: ["gauhati"] },
  { city: "Silchar", state: "Assam", country: "India", lat: 24.8333, lng: 92.7789, aliases: [] },
  { city: "Dibrugarh", state: "Assam", country: "India", lat: 27.4728, lng: 94.9120, aliases: [] },
  { city: "Jorhat", state: "Assam", country: "India", lat: 26.7509, lng: 94.2037, aliases: [] },
  { city: "Nagaon", state: "Assam", country: "India", lat: 26.3464, lng: 92.6840, aliases: ["nowgong"] },
  { city: "Tinsukia", state: "Assam", country: "India", lat: 27.4922, lng: 95.3547, aliases: [] },
  { city: "Tezpur", state: "Assam", country: "India", lat: 26.6338, lng: 92.8000, aliases: [] },
  { city: "Bongaigaon", state: "Assam", country: "India", lat: 26.4769, lng: 90.5588, aliases: [] },
  { city: "Karimganj", state: "Assam", country: "India", lat: 24.8649, lng: 92.3590, aliases: [] },
  { city: "North Lakhimpur", state: "Assam", country: "India", lat: 27.2353, lng: 94.1020, aliases: [] },
  { city: "Diphu", state: "Assam", country: "India", lat: 25.8440, lng: 93.4310, aliases: [] },
  { city: "Goalpara", state: "Assam", country: "India", lat: 26.1690, lng: 90.6260, aliases: [] },
  { city: "Sibsagar", state: "Assam", country: "India", lat: 26.9826, lng: 94.6350, aliases: ["sivasagar"] },
 
  // ─── Bihar ───
  { city: "Patna", state: "Bihar", country: "India", lat: 25.6093, lng: 85.1376, aliases: [] },
  { city: "Gaya", state: "Bihar", country: "India", lat: 24.7914, lng: 84.9994, aliases: [] },
  { city: "Bhagalpur", state: "Bihar", country: "India", lat: 25.2425, lng: 86.9842, aliases: [] },
  { city: "Muzaffarpur", state: "Bihar", country: "India", lat: 26.1225, lng: 85.3906, aliases: [] },
  { city: "Purnia", state: "Bihar", country: "India", lat: 25.7771, lng: 87.4753, aliases: ["purnea"] },
  { city: "Darbhanga", state: "Bihar", country: "India", lat: 26.1542, lng: 85.8918, aliases: [] },
  { city: "Bihar Sharif", state: "Bihar", country: "India", lat: 25.1982, lng: 85.5168, aliases: [] },
  { city: "Arrah", state: "Bihar", country: "India", lat: 25.5541, lng: 84.6603, aliases: ["ara"] },
  { city: "Begusarai", state: "Bihar", country: "India", lat: 25.4182, lng: 86.1272, aliases: [] },
  { city: "Katihar", state: "Bihar", country: "India", lat: 25.5389, lng: 87.5717, aliases: [] },
  { city: "Munger", state: "Bihar", country: "India", lat: 25.3708, lng: 86.4734, aliases: ["monghyr"] },
  { city: "Chapra", state: "Bihar", country: "India", lat: 25.7848, lng: 84.7472, aliases: [] },
  { city: "Saharsa", state: "Bihar", country: "India", lat: 25.8750, lng: 86.5960, aliases: [] },
  { city: "Hajipur", state: "Bihar", country: "India", lat: 25.6857, lng: 85.2167, aliases: [] },
  { city: "Sasaram", state: "Bihar", country: "India", lat: 24.9490, lng: 84.0310, aliases: [] },
  { city: "Dehri", state: "Bihar", country: "India", lat: 24.9056, lng: 84.1827, aliases: [] },
  { city: "Siwan", state: "Bihar", country: "India", lat: 26.2244, lng: 84.3584, aliases: [] },
  { city: "Motihari", state: "Bihar", country: "India", lat: 26.6488, lng: 84.9154, aliases: [] },
  { city: "Nawada", state: "Bihar", country: "India", lat: 24.8860, lng: 85.5420, aliases: [] },
  { city: "Buxar", state: "Bihar", country: "India", lat: 25.5642, lng: 83.9777, aliases: [] },
  { city: "Kishanganj", state: "Bihar", country: "India", lat: 26.0933, lng: 87.9327, aliases: [] },
  { city: "Aurangabad", state: "Bihar", country: "India", lat: 24.7516, lng: 84.3742, aliases: [] },
  { city: "Jehanabad", state: "Bihar", country: "India", lat: 25.2079, lng: 84.9901, aliases: [] },
  { city: "Bettiah", state: "Bihar", country: "India", lat: 26.8030, lng: 84.5175, aliases: [] },
 
  // ─── Chhattisgarh ───
  { city: "Raipur", state: "Chhattisgarh", country: "India", lat: 21.2514, lng: 81.6296, aliases: [] },
  { city: "Bhilai", state: "Chhattisgarh", country: "India", lat: 21.2094, lng: 81.3784, aliases: [] },
  { city: "Bilaspur", state: "Chhattisgarh", country: "India", lat: 22.0797, lng: 82.1391, aliases: [] },
  { city: "Korba", state: "Chhattisgarh", country: "India", lat: 22.3595, lng: 82.7501, aliases: [] },
  { city: "Durg", state: "Chhattisgarh", country: "India", lat: 21.1904, lng: 81.2849, aliases: [] },
  { city: "Rajnandgaon", state: "Chhattisgarh", country: "India", lat: 21.0974, lng: 81.0330, aliases: [] },
  { city: "Jagdalpur", state: "Chhattisgarh", country: "India", lat: 19.0700, lng: 82.0300, aliases: [] },
  { city: "Raigarh", state: "Chhattisgarh", country: "India", lat: 21.8974, lng: 83.3950, aliases: [] },
  { city: "Ambikapur", state: "Chhattisgarh", country: "India", lat: 23.1185, lng: 83.1989, aliases: [] },
  { city: "Mahasamund", state: "Chhattisgarh", country: "India", lat: 21.1084, lng: 82.0979, aliases: [] },
  { city: "Dhamtari", state: "Chhattisgarh", country: "India", lat: 20.7065, lng: 81.5479, aliases: [] },
  { city: "Chirmiri", state: "Chhattisgarh", country: "India", lat: 23.2136, lng: 82.3183, aliases: [] },
 
  // ─── Goa ───
  { city: "Panaji", state: "Goa", country: "India", lat: 15.4909, lng: 73.8278, aliases: ["panjim"] },
  { city: "Margao", state: "Goa", country: "India", lat: 15.2832, lng: 73.9862, aliases: ["madgaon"] },
  { city: "Vasco da Gama", state: "Goa", country: "India", lat: 15.3981, lng: 73.8113, aliases: ["vasco"] },
  { city: "Mapusa", state: "Goa", country: "India", lat: 15.5931, lng: 73.8088, aliases: [] },
  { city: "Ponda", state: "Goa", country: "India", lat: 15.4030, lng: 74.0151, aliases: [] },
 
  // ─── Gujarat ───
  { city: "Ahmedabad", state: "Gujarat", country: "India", lat: 23.0225, lng: 72.5714, aliases: ["amdavad"] },
  { city: "Surat", state: "Gujarat", country: "India", lat: 21.1702, lng: 72.8311, aliases: [] },
  { city: "Vadodara", state: "Gujarat", country: "India", lat: 22.3072, lng: 73.1812, aliases: ["baroda"] },
  { city: "Rajkot", state: "Gujarat", country: "India", lat: 22.3039, lng: 70.8022, aliases: [] },
  { city: "Bhavnagar", state: "Gujarat", country: "India", lat: 21.7645, lng: 72.1519, aliases: [] },
  { city: "Jamnagar", state: "Gujarat", country: "India", lat: 22.4707, lng: 70.0577, aliases: [] },
  { city: "Junagadh", state: "Gujarat", country: "India", lat: 21.5222, lng: 70.4579, aliases: [] },
  { city: "Gandhinagar", state: "Gujarat", country: "India", lat: 23.2156, lng: 72.6369, aliases: [] },
  { city: "Gandhidham", state: "Gujarat", country: "India", lat: 23.0753, lng: 70.1337, aliases: [] },
  { city: "Anand", state: "Gujarat", country: "India", lat: 22.5645, lng: 72.9289, aliases: [] },
  { city: "Navsari", state: "Gujarat", country: "India", lat: 20.9467, lng: 72.9520, aliases: [] },
  { city: "Morbi", state: "Gujarat", country: "India", lat: 22.8173, lng: 70.8370, aliases: [] },
  { city: "Nadiad", state: "Gujarat", country: "India", lat: 22.6916, lng: 72.8634, aliases: [] },
  { city: "Surendranagar", state: "Gujarat", country: "India", lat: 22.7275, lng: 71.6480, aliases: [] },
  { city: "Bharuch", state: "Gujarat", country: "India", lat: 21.7051, lng: 72.9959, aliases: ["broach"] },
  { city: "Mehsana", state: "Gujarat", country: "India", lat: 23.5880, lng: 72.3693, aliases: [] },
  { city: "Porbandar", state: "Gujarat", country: "India", lat: 21.6417, lng: 69.6293, aliases: [] },
  { city: "Godhra", state: "Gujarat", country: "India", lat: 22.7788, lng: 73.6143, aliases: [] },
  { city: "Palanpur", state: "Gujarat", country: "India", lat: 24.1725, lng: 72.4380, aliases: [] },
  { city: "Vapi", state: "Gujarat", country: "India", lat: 20.3893, lng: 72.9106, aliases: [] },
  { city: "Valsad", state: "Gujarat", country: "India", lat: 20.5992, lng: 72.9342, aliases: [] },
  { city: "Patan", state: "Gujarat", country: "India", lat: 23.8493, lng: 72.1266, aliases: [] },
  { city: "Veraval", state: "Gujarat", country: "India", lat: 20.9000, lng: 70.3700, aliases: [] },
  { city: "Dahod", state: "Gujarat", country: "India", lat: 22.8380, lng: 74.2523, aliases: [] },
  { city: "Botad", state: "Gujarat", country: "India", lat: 22.1697, lng: 71.6686, aliases: [] },
  { city: "Amreli", state: "Gujarat", country: "India", lat: 21.5990, lng: 71.2160, aliases: [] },
  { city: "Deesa", state: "Gujarat", country: "India", lat: 24.2585, lng: 72.1891, aliases: [] },
 
  // ─── Haryana ───
  { city: "Gurugram", state: "Haryana", country: "India", lat: 28.4595, lng: 77.0266, aliases: ["gurgaon"] },
  { city: "Faridabad", state: "Haryana", country: "India", lat: 28.4089, lng: 77.3178, aliases: [] },
  { city: "Panipat", state: "Haryana", country: "India", lat: 29.3909, lng: 76.9635, aliases: [] },
  { city: "Ambala", state: "Haryana", country: "India", lat: 30.3782, lng: 76.7767, aliases: [] },
  { city: "Yamunanagar", state: "Haryana", country: "India", lat: 30.1290, lng: 77.2674, aliases: [] },
  { city: "Rohtak", state: "Haryana", country: "India", lat: 28.8955, lng: 76.6066, aliases: [] },
  { city: "Hisar", state: "Haryana", country: "India", lat: 29.1492, lng: 75.7217, aliases: ["hissar"] },
  { city: "Karnal", state: "Haryana", country: "India", lat: 29.6857, lng: 76.9905, aliases: [] },
  { city: "Sonipat", state: "Haryana", country: "India", lat: 28.9931, lng: 77.0151, aliases: ["sonepat"] },
  { city: "Panchkula", state: "Haryana", country: "India", lat: 30.6942, lng: 76.8606, aliases: [] },
  { city: "Bhiwani", state: "Haryana", country: "India", lat: 28.7930, lng: 76.1318, aliases: [] },
  { city: "Sirsa", state: "Haryana", country: "India", lat: 29.5349, lng: 75.0284, aliases: [] },
  { city: "Bahadurgarh", state: "Haryana", country: "India", lat: 28.6926, lng: 76.9315, aliases: [] },
  { city: "Jind", state: "Haryana", country: "India", lat: 29.3160, lng: 76.3141, aliases: [] },
  { city: "Thanesar", state: "Haryana", country: "India", lat: 29.9700, lng: 76.8200, aliases: ["kurukshetra"] },
  { city: "Kaithal", state: "Haryana", country: "India", lat: 29.8015, lng: 76.3998, aliases: [] },
  { city: "Rewari", state: "Haryana", country: "India", lat: 28.1900, lng: 76.6200, aliases: [] },
  { city: "Palwal", state: "Haryana", country: "India", lat: 28.1487, lng: 77.3320, aliases: [] },
 
  // ─── Himachal Pradesh ───
  { city: "Shimla", state: "Himachal Pradesh", country: "India", lat: 31.1048, lng: 77.1734, aliases: ["simla"] },
  { city: "Mandi", state: "Himachal Pradesh", country: "India", lat: 31.7084, lng: 76.9314, aliases: [] },
  { city: "Solan", state: "Himachal Pradesh", country: "India", lat: 30.9045, lng: 77.0967, aliases: [] },
  { city: "Dharamsala", state: "Himachal Pradesh", country: "India", lat: 32.2190, lng: 76.3234, aliases: ["dharamshala"] },
  { city: "Kullu", state: "Himachal Pradesh", country: "India", lat: 31.9579, lng: 77.1095, aliases: [] },
  { city: "Manali", state: "Himachal Pradesh", country: "India", lat: 32.2432, lng: 77.1892, aliases: [] },
  { city: "Bilaspur", state: "Himachal Pradesh", country: "India", lat: 31.3400, lng: 76.7600, aliases: [] },
  { city: "Hamirpur", state: "Himachal Pradesh", country: "India", lat: 31.6847, lng: 76.5211, aliases: [] },
  { city: "Nahan", state: "Himachal Pradesh", country: "India", lat: 30.5600, lng: 77.2900, aliases: [] },
  { city: "Palampur", state: "Himachal Pradesh", country: "India", lat: 32.1109, lng: 76.5363, aliases: [] },
  { city: "Chamba", state: "Himachal Pradesh", country: "India", lat: 32.5534, lng: 76.1258, aliases: [] },
  { city: "Una", state: "Himachal Pradesh", country: "India", lat: 31.4685, lng: 76.2708, aliases: [] },
  { city: "Dalhousie", state: "Himachal Pradesh", country: "India", lat: 32.5530, lng: 75.9715, aliases: [] },
 
  // ─── Jharkhand ───
  { city: "Ranchi", state: "Jharkhand", country: "India", lat: 23.3441, lng: 85.3096, aliases: [] },
  { city: "Jamshedpur", state: "Jharkhand", country: "India", lat: 22.8046, lng: 86.2029, aliases: ["tatanagar"] },
  { city: "Dhanbad", state: "Jharkhand", country: "India", lat: 23.7957, lng: 86.4304, aliases: [] },
  { city: "Bokaro", state: "Jharkhand", country: "India", lat: 23.6693, lng: 86.1511, aliases: ["bokaro steel city"] },
  { city: "Deoghar", state: "Jharkhand", country: "India", lat: 24.4764, lng: 86.6944, aliases: [] },
  { city: "Hazaribagh", state: "Jharkhand", country: "India", lat: 23.9921, lng: 85.3637, aliases: [] },
  { city: "Giridih", state: "Jharkhand", country: "India", lat: 24.1854, lng: 86.3003, aliases: [] },
  { city: "Ramgarh", state: "Jharkhand", country: "India", lat: 23.6300, lng: 85.5600, aliases: [] },
  { city: "Dumka", state: "Jharkhand", country: "India", lat: 24.2667, lng: 87.2500, aliases: [] },
  { city: "Chaibasa", state: "Jharkhand", country: "India", lat: 22.5500, lng: 85.8000, aliases: [] },
  { city: "Phusro", state: "Jharkhand", country: "India", lat: 23.7740, lng: 86.0080, aliases: [] },
  { city: "Medininagar", state: "Jharkhand", country: "India", lat: 24.2103, lng: 84.0772, aliases: ["daltonganj"] },
 
  // ─── Karnataka ───
  { city: "Bengaluru", state: "Karnataka", country: "India", lat: 12.9716, lng: 77.5946, aliases: ["bangalore", "blore", "blr", "benguluru", "bengalooru", "bangaluru"] },
  { city: "Mysuru", state: "Karnataka", country: "India", lat: 12.2958, lng: 76.6394, aliases: ["mysore"] },
  { city: "Mangaluru", state: "Karnataka", country: "India", lat: 12.9141, lng: 74.856, aliases: ["mangalore"] },
  { city: "Hubballi", state: "Karnataka", country: "India", lat: 15.3647, lng: 75.124, aliases: ["hubli"] },
  { city: "Belagavi", state: "Karnataka", country: "India", lat: 15.8497, lng: 74.4977, aliases: ["belgaum"] },
  { city: "Kalaburagi", state: "Karnataka", country: "India", lat: 17.3297, lng: 76.8343, aliases: ["gulbarga"] },
  { city: "Davangere", state: "Karnataka", country: "India", lat: 14.4644, lng: 75.9218, aliases: ["davanagere"] },
  { city: "Ballari", state: "Karnataka", country: "India", lat: 15.1394, lng: 76.9214, aliases: ["bellary"] },
  { city: "Vijayapura", state: "Karnataka", country: "India", lat: 16.8302, lng: 75.7100, aliases: ["bijapur"] },
  { city: "Shivamogga", state: "Karnataka", country: "India", lat: 13.9299, lng: 75.5681, aliases: ["shimoga"] },
  { city: "Tumkuru", state: "Karnataka", country: "India", lat: 13.3392, lng: 77.1017, aliases: ["tumkur"] },
  { city: "Raichur", state: "Karnataka", country: "India", lat: 16.2076, lng: 77.3463, aliases: [] },
  { city: "Bidar", state: "Karnataka", country: "India", lat: 17.9104, lng: 77.5199, aliases: [] },
  { city: "Hospet", state: "Karnataka", country: "India", lat: 15.2689, lng: 76.3909, aliases: ["hosapete"] },
  { city: "Hassan", state: "Karnataka", country: "India", lat: 13.0072, lng: 76.0962, aliases: [] },
  { city: "Gadag", state: "Karnataka", country: "India", lat: 15.4280, lng: 75.6290, aliases: [] },
  { city: "Udupi", state: "Karnataka", country: "India", lat: 13.3409, lng: 74.7421, aliases: [] },
  { city: "Robertson Pet", state: "Karnataka", country: "India", lat: 12.9580, lng: 78.2750, aliases: ["kolar gold fields", "kgf"] },
  { city: "Mandya", state: "Karnataka", country: "India", lat: 12.5220, lng: 76.8952, aliases: [] },
  { city: "Chikkamagaluru", state: "Karnataka", country: "India", lat: 13.3161, lng: 75.7720, aliases: ["chikmagalur"] },
  { city: "Gangavathi", state: "Karnataka", country: "India", lat: 15.4317, lng: 76.5297, aliases: [] },
  { city: "Bagalkot", state: "Karnataka", country: "India", lat: 16.1691, lng: 75.6960, aliases: [] },
  { city: "Ranebennur", state: "Karnataka", country: "India", lat: 14.6201, lng: 75.6348, aliases: [] },
 
  // ─── Kerala ───
  { city: "Thiruvananthapuram", state: "Kerala", country: "India", lat: 8.5241, lng: 76.9366, aliases: ["trivandrum"] },
  { city: "Kochi", state: "Kerala", country: "India", lat: 9.9312, lng: 76.2673, aliases: ["cochin", "ernakulam"] },
  { city: "Kozhikode", state: "Kerala", country: "India", lat: 11.2588, lng: 75.7804, aliases: ["calicut"] },
  { city: "Thrissur", state: "Kerala", country: "India", lat: 10.5276, lng: 76.2144, aliases: ["trichur"] },
  { city: "Kollam", state: "Kerala", country: "India", lat: 8.8932, lng: 76.6141, aliases: ["quilon"] },
  { city: "Kannur", state: "Kerala", country: "India", lat: 11.8745, lng: 75.3704, aliases: ["cannanore"] },
  { city: "Alappuzha", state: "Kerala", country: "India", lat: 9.4981, lng: 76.3388, aliases: ["alleppey"] },
  { city: "Palakkad", state: "Kerala", country: "India", lat: 10.7867, lng: 76.6548, aliases: ["palghat"] },
  { city: "Kottayam", state: "Kerala", country: "India", lat: 9.5916, lng: 76.5222, aliases: [] },
  { city: "Malappuram", state: "Kerala", country: "India", lat: 11.0510, lng: 76.0711, aliases: [] },
  { city: "Kasaragod", state: "Kerala", country: "India", lat: 12.4996, lng: 74.9869, aliases: [] },
  { city: "Idukki", state: "Kerala", country: "India", lat: 9.8504, lng: 76.9710, aliases: [] },
  { city: "Pathanamthitta", state: "Kerala", country: "India", lat: 9.2648, lng: 76.7870, aliases: [] },
  { city: "Wayanad", state: "Kerala", country: "India", lat: 11.6854, lng: 76.1320, aliases: [] },
  { city: "Thalassery", state: "Kerala", country: "India", lat: 11.7471, lng: 75.4909, aliases: ["tellicherry"] },
 
  // ─── Madhya Pradesh ───
  { city: "Bhopal", state: "Madhya Pradesh", country: "India", lat: 23.2599, lng: 77.4126, aliases: [] },
  { city: "Indore", state: "Madhya Pradesh", country: "India", lat: 22.7196, lng: 75.8577, aliases: [] },
  { city: "Jabalpur", state: "Madhya Pradesh", country: "India", lat: 23.1815, lng: 79.9864, aliases: ["jubbulpore"] },
  { city: "Gwalior", state: "Madhya Pradesh", country: "India", lat: 26.2183, lng: 78.1828, aliases: [] },
  { city: "Ujjain", state: "Madhya Pradesh", country: "India", lat: 23.1765, lng: 75.7885, aliases: [] },
  { city: "Sagar", state: "Madhya Pradesh", country: "India", lat: 23.8388, lng: 78.7378, aliases: ["saugor"] },
  { city: "Dewas", state: "Madhya Pradesh", country: "India", lat: 22.9623, lng: 76.0508, aliases: [] },
  { city: "Satna", state: "Madhya Pradesh", country: "India", lat: 24.5004, lng: 80.8322, aliases: [] },
  { city: "Ratlam", state: "Madhya Pradesh", country: "India", lat: 23.3315, lng: 75.0367, aliases: [] },
  { city: "Rewa", state: "Madhya Pradesh", country: "India", lat: 24.5362, lng: 81.3037, aliases: [] },
  { city: "Singrauli", state: "Madhya Pradesh", country: "India", lat: 24.1990, lng: 82.6744, aliases: [] },
  { city: "Murwara", state: "Madhya Pradesh", country: "India", lat: 23.8500, lng: 80.3900, aliases: ["katni"] },
  { city: "Chhindwara", state: "Madhya Pradesh", country: "India", lat: 22.0574, lng: 78.9382, aliases: [] },
  { city: "Burhanpur", state: "Madhya Pradesh", country: "India", lat: 21.3104, lng: 76.2301, aliases: [] },
  { city: "Khandwa", state: "Madhya Pradesh", country: "India", lat: 21.8247, lng: 76.3512, aliases: [] },
  { city: "Bhind", state: "Madhya Pradesh", country: "India", lat: 26.5636, lng: 78.7843, aliases: [] },
  { city: "Morena", state: "Madhya Pradesh", country: "India", lat: 26.4950, lng: 77.9920, aliases: [] },
  { city: "Mandsaur", state: "Madhya Pradesh", country: "India", lat: 24.0714, lng: 75.0704, aliases: [] },
  { city: "Vidisha", state: "Madhya Pradesh", country: "India", lat: 23.5251, lng: 77.8081, aliases: [] },
  { city: "Damoh", state: "Madhya Pradesh", country: "India", lat: 23.8340, lng: 79.4420, aliases: [] },
  { city: "Chhatarpur", state: "Madhya Pradesh", country: "India", lat: 24.9170, lng: 79.5894, aliases: [] },
  { city: "Guna", state: "Madhya Pradesh", country: "India", lat: 24.6477, lng: 77.3120, aliases: [] },
  { city: "Shivpuri", state: "Madhya Pradesh", country: "India", lat: 25.4260, lng: 77.6600, aliases: [] },
  { city: "Neemuch", state: "Madhya Pradesh", country: "India", lat: 24.4719, lng: 74.8692, aliases: [] },
  { city: "Datia", state: "Madhya Pradesh", country: "India", lat: 25.6700, lng: 78.4600, aliases: [] },
  { city: "Hoshangabad", state: "Madhya Pradesh", country: "India", lat: 22.7546, lng: 77.7265, aliases: ["narmadapuram"] },
  { city: "Itarsi", state: "Madhya Pradesh", country: "India", lat: 22.6100, lng: 77.7600, aliases: [] },
  { city: "Tikamgarh", state: "Madhya Pradesh", country: "India", lat: 24.7400, lng: 78.8300, aliases: [] },
  { city: "Seoni", state: "Madhya Pradesh", country: "India", lat: 22.0855, lng: 79.5440, aliases: [] },
 
  // ─── Maharashtra ───
  { city: "Mumbai", state: "Maharashtra", country: "India", lat: 19.076, lng: 72.8777, aliases: ["bombay"] },
  { city: "Pune", state: "Maharashtra", country: "India", lat: 18.5204, lng: 73.8567, aliases: ["poona"] },
  { city: "Nagpur", state: "Maharashtra", country: "India", lat: 21.1458, lng: 79.0882, aliases: [] },
  { city: "Thane", state: "Maharashtra", country: "India", lat: 19.2183, lng: 72.9781, aliases: [] },
  { city: "Nashik", state: "Maharashtra", country: "India", lat: 20.0063, lng: 73.7900, aliases: ["nasik"] },
  { city: "Aurangabad", state: "Maharashtra", country: "India", lat: 19.8762, lng: 75.3433, aliases: ["chhatrapati sambhajinagar"] },
  { city: "Solapur", state: "Maharashtra", country: "India", lat: 17.6599, lng: 75.9064, aliases: ["sholapur"] },
  { city: "Kolhapur", state: "Maharashtra", country: "India", lat: 16.7050, lng: 74.2433, aliases: [] },
  { city: "Amravati", state: "Maharashtra", country: "India", lat: 20.9374, lng: 77.7796, aliases: [] },
  { city: "Navi Mumbai", state: "Maharashtra", country: "India", lat: 19.0330, lng: 73.0297, aliases: ["new bombay"] },
  { city: "Sangli", state: "Maharashtra", country: "India", lat: 16.8524, lng: 74.5815, aliases: [] },
  { city: "Malegaon", state: "Maharashtra", country: "India", lat: 20.5579, lng: 74.5089, aliases: [] },
  { city: "Jalgaon", state: "Maharashtra", country: "India", lat: 21.0077, lng: 75.5626, aliases: [] },
  { city: "Akola", state: "Maharashtra", country: "India", lat: 20.7002, lng: 77.0082, aliases: [] },
  { city: "Latur", state: "Maharashtra", country: "India", lat: 18.3968, lng: 76.5604, aliases: [] },
  { city: "Dhule", state: "Maharashtra", country: "India", lat: 20.9042, lng: 74.7749, aliases: [] },
  { city: "Ahmednagar", state: "Maharashtra", country: "India", lat: 19.0948, lng: 74.7480, aliases: [] },
  { city: "Chandrapur", state: "Maharashtra", country: "India", lat: 19.9615, lng: 79.2961, aliases: [] },
  { city: "Parbhani", state: "Maharashtra", country: "India", lat: 19.2610, lng: 76.7600, aliases: [] },
  { city: "Ichalkaranji", state: "Maharashtra", country: "India", lat: 16.6953, lng: 74.4603, aliases: [] },
  { city: "Jalna", state: "Maharashtra", country: "India", lat: 19.8347, lng: 75.8816, aliases: [] },
  { city: "Nanded", state: "Maharashtra", country: "India", lat: 19.1383, lng: 77.3210, aliases: [] },
  { city: "Ambarnath", state: "Maharashtra", country: "India", lat: 19.1864, lng: 73.1924, aliases: [] },
  { city: "Bhiwandi", state: "Maharashtra", country: "India", lat: 19.2961, lng: 73.0591, aliases: [] },
  { city: "Panvel", state: "Maharashtra", country: "India", lat: 18.9894, lng: 73.1175, aliases: [] },
  { city: "Satara", state: "Maharashtra", country: "India", lat: 17.6805, lng: 74.0183, aliases: [] },
  { city: "Beed", state: "Maharashtra", country: "India", lat: 18.9893, lng: 75.7602, aliases: ["bid"] },
  { city: "Yavatmal", state: "Maharashtra", country: "India", lat: 20.3899, lng: 78.1307, aliases: [] },
  { city: "Osmanabad", state: "Maharashtra", country: "India", lat: 18.1860, lng: 76.0440, aliases: ["dharashiv"] },
  { city: "Wardha", state: "Maharashtra", country: "India", lat: 20.7453, lng: 78.6022, aliases: [] },
  { city: "Gondia", state: "Maharashtra", country: "India", lat: 21.4602, lng: 80.1920, aliases: [] },
  { city: "Ratnagiri", state: "Maharashtra", country: "India", lat: 16.9944, lng: 73.3000, aliases: [] },
  { city: "Hingoli", state: "Maharashtra", country: "India", lat: 19.7170, lng: 77.1520, aliases: [] },
  { city: "Washim", state: "Maharashtra", country: "India", lat: 20.1122, lng: 77.1330, aliases: [] },
  { city: "Sindhudurg", state: "Maharashtra", country: "India", lat: 16.3489, lng: 73.7556, aliases: [] },
 
  // ─── Manipur ───
  { city: "Imphal", state: "Manipur", country: "India", lat: 24.8170, lng: 93.9368, aliases: [] },
  { city: "Thoubal", state: "Manipur", country: "India", lat: 24.6308, lng: 94.0133, aliases: [] },
  { city: "Bishnupur", state: "Manipur", country: "India", lat: 24.6173, lng: 93.7750, aliases: [] },
  { city: "Churachandpur", state: "Manipur", country: "India", lat: 24.3338, lng: 93.6833, aliases: [] },
 
  // ─── Meghalaya ───
  { city: "Shillong", state: "Meghalaya", country: "India", lat: 25.5788, lng: 91.8933, aliases: [] },
  { city: "Tura", state: "Meghalaya", country: "India", lat: 25.5144, lng: 90.1998, aliases: [] },
  { city: "Nongpoh", state: "Meghalaya", country: "India", lat: 25.8982, lng: 91.8838, aliases: [] },
  { city: "Jowai", state: "Meghalaya", country: "India", lat: 25.4527, lng: 92.2041, aliases: [] },
  { city: "Cherrapunji", state: "Meghalaya", country: "India", lat: 25.2700, lng: 91.7200, aliases: ["sohra"] },
 
  // ─── Mizoram ───
  { city: "Aizawl", state: "Mizoram", country: "India", lat: 23.7271, lng: 92.7176, aliases: [] },
  { city: "Lunglei", state: "Mizoram", country: "India", lat: 22.8820, lng: 92.7294, aliases: [] },
  { city: "Champhai", state: "Mizoram", country: "India", lat: 23.4567, lng: 93.3281, aliases: [] },
  { city: "Serchhip", state: "Mizoram", country: "India", lat: 23.3080, lng: 92.8400, aliases: [] },
 
  // ─── Nagaland ───
  { city: "Kohima", state: "Nagaland", country: "India", lat: 25.6751, lng: 94.1086, aliases: [] },
  { city: "Dimapur", state: "Nagaland", country: "India", lat: 25.9065, lng: 93.7272, aliases: [] },
  { city: "Mokokchung", state: "Nagaland", country: "India", lat: 26.3200, lng: 94.5100, aliases: [] },
  { city: "Tuensang", state: "Nagaland", country: "India", lat: 26.2700, lng: 94.8200, aliases: [] },
  { city: "Wokha", state: "Nagaland", country: "India", lat: 26.1000, lng: 94.2700, aliases: [] },
  { city: "Zunheboto", state: "Nagaland", country: "India", lat: 25.9700, lng: 94.5300, aliases: [] },
 
  // ─── Odisha ───
  { city: "Bhubaneswar", state: "Odisha", country: "India", lat: 20.2961, lng: 85.8245, aliases: [] },
  { city: "Cuttack", state: "Odisha", country: "India", lat: 20.4625, lng: 85.883, aliases: [] },
  { city: "Rourkela", state: "Odisha", country: "India", lat: 22.2604, lng: 84.8536, aliases: [] },
  { city: "Berhampur", state: "Odisha", country: "India", lat: 19.3150, lng: 84.7941, aliases: ["brahmapur"] },
  { city: "Sambalpur", state: "Odisha", country: "India", lat: 21.4669, lng: 83.9756, aliases: [] },
  { city: "Puri", state: "Odisha", country: "India", lat: 19.8135, lng: 85.8312, aliases: [] },
  { city: "Balasore", state: "Odisha", country: "India", lat: 21.4942, lng: 86.9319, aliases: ["baleshwar"] },
  { city: "Baripada", state: "Odisha", country: "India", lat: 21.9322, lng: 86.7250, aliases: [] },
  { city: "Bhadrak", state: "Odisha", country: "India", lat: 21.0545, lng: 86.4958, aliases: [] },
  { city: "Jharsuguda", state: "Odisha", country: "India", lat: 21.8554, lng: 84.0063, aliases: [] },
  { city: "Jeypore", state: "Odisha", country: "India", lat: 18.8563, lng: 82.5716, aliases: [] },
  { city: "Angul", state: "Odisha", country: "India", lat: 20.8378, lng: 85.0985, aliases: [] },
  { city: "Barbil", state: "Odisha", country: "India", lat: 22.1000, lng: 85.3700, aliases: [] },
  { city: "Paradip", state: "Odisha", country: "India", lat: 20.3164, lng: 86.6085, aliases: [] },
  { city: "Kendrapara", state: "Odisha", country: "India", lat: 20.5023, lng: 86.4209, aliases: [] },
  { city: "Sunabeda", state: "Odisha", country: "India", lat: 18.7668, lng: 82.8631, aliases: [] },
 
  // ─── Punjab ───
  { city: "Ludhiana", state: "Punjab", country: "India", lat: 30.9010, lng: 75.8573, aliases: [] },
  { city: "Amritsar", state: "Punjab", country: "India", lat: 31.634, lng: 74.8723, aliases: [] },
  { city: "Jalandhar", state: "Punjab", country: "India", lat: 31.3260, lng: 75.5762, aliases: ["jullundur"] },
  { city: "Patiala", state: "Punjab", country: "India", lat: 30.3398, lng: 76.3869, aliases: [] },
  { city: "Bathinda", state: "Punjab", country: "India", lat: 30.2070, lng: 74.9519, aliases: ["bhatinda"] },
  { city: "Mohali", state: "Punjab", country: "India", lat: 30.7046, lng: 76.7179, aliases: ["sas nagar"] },
  { city: "Pathankot", state: "Punjab", country: "India", lat: 32.2643, lng: 75.6421, aliases: [] },
  { city: "Hoshiarpur", state: "Punjab", country: "India", lat: 31.5143, lng: 75.9115, aliases: [] },
  { city: "Batala", state: "Punjab", country: "India", lat: 31.8185, lng: 75.2017, aliases: [] },
  { city: "Moga", state: "Punjab", country: "India", lat: 30.8091, lng: 75.1748, aliases: [] },
  { city: "Abohar", state: "Punjab", country: "India", lat: 30.1453, lng: 74.1952, aliases: [] },
  { city: "Malerkotla", state: "Punjab", country: "India", lat: 30.5282, lng: 75.8839, aliases: [] },
  { city: "Khanna", state: "Punjab", country: "India", lat: 30.6975, lng: 76.2128, aliases: [] },
  { city: "Muktsar", state: "Punjab", country: "India", lat: 30.4753, lng: 74.5156, aliases: [] },
  { city: "Barnala", state: "Punjab", country: "India", lat: 30.3812, lng: 75.5488, aliases: [] },
  { city: "Rajpura", state: "Punjab", country: "India", lat: 30.4848, lng: 76.5913, aliases: [] },
  { city: "Firozpur", state: "Punjab", country: "India", lat: 30.9330, lng: 74.6130, aliases: ["ferozepur"] },
  { city: "Kapurthala", state: "Punjab", country: "India", lat: 31.3725, lng: 75.3804, aliases: [] },
  { city: "Phagwara", state: "Punjab", country: "India", lat: 31.2240, lng: 75.7708, aliases: [] },
  { city: "Sangrur", state: "Punjab", country: "India", lat: 30.2457, lng: 75.8421, aliases: [] },
  { city: "Mansa", state: "Punjab", country: "India", lat: 29.9930, lng: 75.3942, aliases: [] },
  { city: "Faridkot", state: "Punjab", country: "India", lat: 30.6769, lng: 74.7574, aliases: [] },
  { city: "Nawanshahr", state: "Punjab", country: "India", lat: 31.1246, lng: 76.1184, aliases: ["shaheed bhagat singh nagar"] },
  { city: "Gurdaspur", state: "Punjab", country: "India", lat: 32.0414, lng: 75.4026, aliases: [] },
  { city: "Rupnagar", state: "Punjab", country: "India", lat: 30.9661, lng: 76.5228, aliases: ["ropar"] },
  { city: "Zirakpur", state: "Punjab", country: "India", lat: 30.6429, lng: 76.8166, aliases: [] },
 
  // ─── Rajasthan ───
  { city: "Jaipur", state: "Rajasthan", country: "India", lat: 26.9124, lng: 75.7873, aliases: [] },
  { city: "Jodhpur", state: "Rajasthan", country: "India", lat: 26.2389, lng: 73.0243, aliases: [] },
  { city: "Kota", state: "Rajasthan", country: "India", lat: 25.2138, lng: 75.8648, aliases: [] },
  { city: "Bikaner", state: "Rajasthan", country: "India", lat: 28.0229, lng: 73.3119, aliases: [] },
  { city: "Udaipur", state: "Rajasthan", country: "India", lat: 24.5854, lng: 73.7125, aliases: [] },
  { city: "Ajmer", state: "Rajasthan", country: "India", lat: 26.4499, lng: 74.6399, aliases: [] },
  { city: "Bhilwara", state: "Rajasthan", country: "India", lat: 25.3407, lng: 74.6313, aliases: [] },
  { city: "Alwar", state: "Rajasthan", country: "India", lat: 27.5530, lng: 76.6346, aliases: [] },
  { city: "Bharatpur", state: "Rajasthan", country: "India", lat: 27.2152, lng: 77.5030, aliases: [] },
  { city: "Sri Ganganagar", state: "Rajasthan", country: "India", lat: 29.9094, lng: 73.8760, aliases: ["ganganagar"] },
  { city: "Sikar", state: "Rajasthan", country: "India", lat: 27.6094, lng: 75.1399, aliases: [] },
  { city: "Pali", state: "Rajasthan", country: "India", lat: 25.7711, lng: 73.3234, aliases: [] },
  { city: "Tonk", state: "Rajasthan", country: "India", lat: 26.1635, lng: 75.7893, aliases: [] },
  { city: "Beawar", state: "Rajasthan", country: "India", lat: 26.1012, lng: 74.3209, aliases: [] },
  { city: "Hanumangarh", state: "Rajasthan", country: "India", lat: 29.5819, lng: 74.3294, aliases: [] },
  { city: "Nagaur", state: "Rajasthan", country: "India", lat: 27.2024, lng: 73.7350, aliases: [] },
  { city: "Jhunjhunu", state: "Rajasthan", country: "India", lat: 28.1289, lng: 75.3963, aliases: [] },
  { city: "Chittorgarh", state: "Rajasthan", country: "India", lat: 24.8887, lng: 74.6269, aliases: [] },
  { city: "Churu", state: "Rajasthan", country: "India", lat: 28.2870, lng: 74.9678, aliases: [] },
  { city: "Kishangarh", state: "Rajasthan", country: "India", lat: 26.5921, lng: 74.8537, aliases: [] },
  { city: "Barmer", state: "Rajasthan", country: "India", lat: 25.7521, lng: 71.3967, aliases: [] },
  { city: "Dhaulpur", state: "Rajasthan", country: "India", lat: 26.6929, lng: 77.8890, aliases: [] },
  { city: "Sawai Madhopur", state: "Rajasthan", country: "India", lat: 26.0223, lng: 76.3569, aliases: [] },
  { city: "Bundi", state: "Rajasthan", country: "India", lat: 25.4305, lng: 75.6499, aliases: [] },
  { city: "Baran", state: "Rajasthan", country: "India", lat: 25.0976, lng: 76.5132, aliases: [] },
  { city: "Jaisalmer", state: "Rajasthan", country: "India", lat: 26.9157, lng: 70.9083, aliases: [] },
  { city: "Mount Abu", state: "Rajasthan", country: "India", lat: 24.5926, lng: 72.7156, aliases: [] },
  { city: "Pushkar", state: "Rajasthan", country: "India", lat: 26.4898, lng: 74.5511, aliases: [] },
  { city: "Banswara", state: "Rajasthan", country: "India", lat: 23.5464, lng: 74.4423, aliases: [] },
  { city: "Dungarpur", state: "Rajasthan", country: "India", lat: 23.8430, lng: 73.7148, aliases: [] },
  { city: "Jhalawar", state: "Rajasthan", country: "India", lat: 24.5972, lng: 76.1652, aliases: [] },
  { city: "Pratapgarh", state: "Rajasthan", country: "India", lat: 24.0308, lng: 74.7780, aliases: [] },
  { city: "Rajsamand", state: "Rajasthan", country: "India", lat: 25.0681, lng: 73.8800, aliases: [] },
  { city: "Sirohi", state: "Rajasthan", country: "India", lat: 24.8860, lng: 72.8629, aliases: [] },
 
  // ─── Sikkim ───
  { city: "Gangtok", state: "Sikkim", country: "India", lat: 27.3389, lng: 88.6065, aliases: [] },
  { city: "Namchi", state: "Sikkim", country: "India", lat: 27.1649, lng: 88.3511, aliases: [] },
  { city: "Gyalshing", state: "Sikkim", country: "India", lat: 27.2897, lng: 88.2559, aliases: ["geyzing"] },
  { city: "Mangan", state: "Sikkim", country: "India", lat: 27.5098, lng: 88.5321, aliases: [] },
  { city: "Pelling", state: "Sikkim", country: "India", lat: 27.3020, lng: 88.2400, aliases: [] },
  { city: "Ravangla", state: "Sikkim", country: "India", lat: 27.3100, lng: 88.3600, aliases: [] },
 
  // ─── Tamil Nadu ───
  { city: "Chennai", state: "Tamil Nadu", country: "India", lat: 13.0827, lng: 80.2707, aliases: ["madras"] },
  { city: "Coimbatore", state: "Tamil Nadu", country: "India", lat: 11.0168, lng: 76.9558, aliases: ["kovai"] },
  { city: "Madurai", state: "Tamil Nadu", country: "India", lat: 9.9252, lng: 78.1198, aliases: [] },
  { city: "Tiruchirappalli", state: "Tamil Nadu", country: "India", lat: 10.7905, lng: 78.7047, aliases: ["trichy"] },
  { city: "Salem", state: "Tamil Nadu", country: "India", lat: 11.6643, lng: 78.146, aliases: [] },
  { city: "Tirunelveli", state: "Tamil Nadu", country: "India", lat: 8.7139, lng: 77.7567, aliases: ["tinnevelly"] },
  { city: "Tiruppur", state: "Tamil Nadu", country: "India", lat: 11.1085, lng: 77.3411, aliases: ["tirupur"] },
  { city: "Erode", state: "Tamil Nadu", country: "India", lat: 11.3410, lng: 77.7172, aliases: [] },
  { city: "Vellore", state: "Tamil Nadu", country: "India", lat: 12.9165, lng: 79.1325, aliases: [] },
  { city: "Thoothukudi", state: "Tamil Nadu", country: "India", lat: 8.7642, lng: 78.1348, aliases: ["tuticorin"] },
  { city: "Dindigul", state: "Tamil Nadu", country: "India", lat: 10.3624, lng: 77.9695, aliases: [] },
  { city: "Thanjavur", state: "Tamil Nadu", country: "India", lat: 10.7870, lng: 79.1378, aliases: ["tanjore"] },
  { city: "Ranipet", state: "Tamil Nadu", country: "India", lat: 12.9396, lng: 79.3327, aliases: [] },
  { city: "Sivakasi", state: "Tamil Nadu", country: "India", lat: 9.4533, lng: 77.7981, aliases: [] },
  { city: "Karur", state: "Tamil Nadu", country: "India", lat: 10.9601, lng: 78.0766, aliases: [] },
  { city: "Udhagamandalam", state: "Tamil Nadu", country: "India", lat: 11.4064, lng: 76.6932, aliases: ["ooty"] },
  { city: "Hosur", state: "Tamil Nadu", country: "India", lat: 12.7409, lng: 77.8253, aliases: [] },
  { city: "Nagercoil", state: "Tamil Nadu", country: "India", lat: 8.1833, lng: 77.4119, aliases: [] },
  { city: "Kanchipuram", state: "Tamil Nadu", country: "India", lat: 12.8342, lng: 79.7036, aliases: ["kanchi", "conjeevaram"] },
  { city: "Kumbakonam", state: "Tamil Nadu", country: "India", lat: 10.9617, lng: 79.3881, aliases: [] },
  { city: "Cuddalore", state: "Tamil Nadu", country: "India", lat: 11.7480, lng: 79.7714, aliases: [] },
  { city: "Rajapalayam", state: "Tamil Nadu", country: "India", lat: 9.4547, lng: 77.5567, aliases: [] },
  { city: "Nagapattinam", state: "Tamil Nadu", country: "India", lat: 10.7672, lng: 79.8449, aliases: [] },
  { city: "Viluppuram", state: "Tamil Nadu", country: "India", lat: 11.9395, lng: 79.4924, aliases: [] },
  { city: "Pollachi", state: "Tamil Nadu", country: "India", lat: 10.6580, lng: 77.0081, aliases: [] },
  { city: "Ambur", state: "Tamil Nadu", country: "India", lat: 12.7906, lng: 78.7108, aliases: [] },
  { city: "Namakkal", state: "Tamil Nadu", country: "India", lat: 11.2189, lng: 78.1674, aliases: [] },
  { city: "Pudukkottai", state: "Tamil Nadu", country: "India", lat: 10.3833, lng: 78.8001, aliases: [] },
  { city: "Krishnagiri", state: "Tamil Nadu", country: "India", lat: 12.5186, lng: 78.2138, aliases: [] },
  { city: "Tiruvottiyur", state: "Tamil Nadu", country: "India", lat: 13.1600, lng: 80.3000, aliases: [] },
  { city: "Tiruvallur", state: "Tamil Nadu", country: "India", lat: 13.1440, lng: 79.9078, aliases: [] },
  { city: "Pondicherry", state: "Puducherry", country: "India", lat: 11.9416, lng: 79.8083, aliases: ["puducherry"] },
 
  // ─── Telangana ───
  { city: "Hyderabad", state: "Telangana", country: "India", lat: 17.385, lng: 78.4867, aliases: ["hyd"] },
  { city: "Warangal", state: "Telangana", country: "India", lat: 17.9784, lng: 79.5941, aliases: [] },
  { city: "Nizamabad", state: "Telangana", country: "India", lat: 18.6725, lng: 78.0942, aliases: [] },
  { city: "Karimnagar", state: "Telangana", country: "India", lat: 18.4386, lng: 79.1288, aliases: [] },
  { city: "Khammam", state: "Telangana", country: "India", lat: 17.2473, lng: 80.1514, aliases: [] },
  { city: "Mahbubnagar", state: "Telangana", country: "India", lat: 16.7488, lng: 78.0035, aliases: ["palamuru"] },
  { city: "Nalgonda", state: "Telangana", country: "India", lat: 17.0583, lng: 79.2671, aliases: [] },
  { city: "Adilabad", state: "Telangana", country: "India", lat: 19.6641, lng: 78.5320, aliases: [] },
  { city: "Suryapet", state: "Telangana", country: "India", lat: 17.1440, lng: 79.6240, aliases: [] },
  { city: "Miryalaguda", state: "Telangana", country: "India", lat: 16.8733, lng: 79.5618, aliases: [] },
  { city: "Siddipet", state: "Telangana", country: "India", lat: 18.1019, lng: 78.8520, aliases: [] },
  { city: "Mancherial", state: "Telangana", country: "India", lat: 18.8691, lng: 79.4627, aliases: [] },
  { city: "Bodhan", state: "Telangana", country: "India", lat: 18.6641, lng: 77.8873, aliases: [] },
  { city: "Secunderabad", state: "Telangana", country: "India", lat: 17.4399, lng: 78.4983, aliases: [] },
 
  // ─── Tripura ───
  { city: "Agartala", state: "Tripura", country: "India", lat: 23.8315, lng: 91.2868, aliases: [] },
  { city: "Udaipur", state: "Tripura", country: "India", lat: 23.5333, lng: 91.4833, aliases: [] },
  { city: "Dharmanagar", state: "Tripura", country: "India", lat: 24.3698, lng: 92.1767, aliases: [] },
  { city: "Kailashahar", state: "Tripura", country: "India", lat: 24.3319, lng: 92.0066, aliases: [] },
  { city: "Ambassa", state: "Tripura", country: "India", lat: 23.9200, lng: 91.8500, aliases: [] },
 
  // ─── Uttar Pradesh ───
  { city: "Lucknow", state: "Uttar Pradesh", country: "India", lat: 26.8467, lng: 80.9462, aliases: [] },
  { city: "Kanpur", state: "Uttar Pradesh", country: "India", lat: 26.4499, lng: 80.3319, aliases: ["cawnpore"] },
  { city: "Agra", state: "Uttar Pradesh", country: "India", lat: 27.1767, lng: 78.0081, aliases: [] },
  { city: "Varanasi", state: "Uttar Pradesh", country: "India", lat: 25.3176, lng: 82.9739, aliases: ["banaras", "benares", "kashi"] },
  { city: "Prayagraj", state: "Uttar Pradesh", country: "India", lat: 25.4358, lng: 81.8463, aliases: ["allahabad"] },
  { city: "Meerut", state: "Uttar Pradesh", country: "India", lat: 28.9845, lng: 77.7064, aliases: [] },
  { city: "Ghaziabad", state: "Uttar Pradesh", country: "India", lat: 28.6692, lng: 77.4538, aliases: [] },
  { city: "Noida", state: "Uttar Pradesh", country: "India", lat: 28.5355, lng: 77.391, aliases: [] },
  { city: "Greater Noida", state: "Uttar Pradesh", country: "India", lat: 28.4744, lng: 77.504, aliases: [] },
  { city: "Bareilly", state: "Uttar Pradesh", country: "India", lat: 28.3670, lng: 79.4304, aliases: [] },
  { city: "Aligarh", state: "Uttar Pradesh", country: "India", lat: 27.8974, lng: 78.088, aliases: [] },
  { city: "Moradabad", state: "Uttar Pradesh", country: "India", lat: 28.8386, lng: 78.7733, aliases: [] },
  { city: "Gorakhpur", state: "Uttar Pradesh", country: "India", lat: 26.7606, lng: 83.3732, aliases: [] },
  { city: "Saharanpur", state: "Uttar Pradesh", country: "India", lat: 29.9680, lng: 77.5510, aliases: [] },
  { city: "Jhansi", state: "Uttar Pradesh", country: "India", lat: 25.4484, lng: 78.5685, aliases: [] },
  { city: "Mathura", state: "Uttar Pradesh", country: "India", lat: 27.4924, lng: 77.6737, aliases: [] },
  { city: "Firozabad", state: "Uttar Pradesh", country: "India", lat: 27.1515, lng: 78.3957, aliases: [] },
  { city: "Muzaffarnagar", state: "Uttar Pradesh", country: "India", lat: 29.4727, lng: 77.7085, aliases: [] },
  { city: "Shahjahanpur", state: "Uttar Pradesh", country: "India", lat: 27.8806, lng: 79.9110, aliases: [] },
  { city: "Rampur", state: "Uttar Pradesh", country: "India", lat: 28.7930, lng: 79.0250, aliases: [] },
  { city: "Ayodhya", state: "Uttar Pradesh", country: "India", lat: 26.7922, lng: 82.1998, aliases: ["faizabad"] },
  { city: "Etawah", state: "Uttar Pradesh", country: "India", lat: 26.7855, lng: 79.0159, aliases: [] },
  { city: "Mirzapur", state: "Uttar Pradesh", country: "India", lat: 25.1451, lng: 82.5690, aliases: [] },
  { city: "Bulandshahr", state: "Uttar Pradesh", country: "India", lat: 28.4070, lng: 77.8498, aliases: [] },
  { city: "Sambhal", state: "Uttar Pradesh", country: "India", lat: 28.5838, lng: 78.5570, aliases: [] },
  { city: "Amroha", state: "Uttar Pradesh", country: "India", lat: 28.9036, lng: 78.4689, aliases: [] },
  { city: "Hardoi", state: "Uttar Pradesh", country: "India", lat: 27.3922, lng: 80.1246, aliases: [] },
  { city: "Fatehpur", state: "Uttar Pradesh", country: "India", lat: 25.9300, lng: 80.8000, aliases: [] },
  { city: "Rae Bareli", state: "Uttar Pradesh", country: "India", lat: 26.2185, lng: 81.2329, aliases: [] },
  { city: "Banda", state: "Uttar Pradesh", country: "India", lat: 25.4766, lng: 80.3326, aliases: [] },
  { city: "Lakhimpur Kheri", state: "Uttar Pradesh", country: "India", lat: 27.9462, lng: 80.7821, aliases: [] },
  { city: "Unnao", state: "Uttar Pradesh", country: "India", lat: 26.5393, lng: 80.4876, aliases: [] },
  { city: "Sitapur", state: "Uttar Pradesh", country: "India", lat: 27.5651, lng: 80.6826, aliases: [] },
  { city: "Sultanpur", state: "Uttar Pradesh", country: "India", lat: 26.2648, lng: 82.0727, aliases: [] },
  { city: "Bahraich", state: "Uttar Pradesh", country: "India", lat: 27.5744, lng: 81.5943, aliases: [] },
  { city: "Azamgarh", state: "Uttar Pradesh", country: "India", lat: 26.0689, lng: 83.1862, aliases: [] },
  { city: "Jaunpur", state: "Uttar Pradesh", country: "India", lat: 25.7464, lng: 82.6837, aliases: [] },
  { city: "Basti", state: "Uttar Pradesh", country: "India", lat: 26.7955, lng: 82.7288, aliases: [] },
  { city: "Deoria", state: "Uttar Pradesh", country: "India", lat: 26.5024, lng: 83.7791, aliases: [] },
  { city: "Orai", state: "Uttar Pradesh", country: "India", lat: 25.9920, lng: 79.4530, aliases: [] },
  { city: "Mainpuri", state: "Uttar Pradesh", country: "India", lat: 27.2300, lng: 79.0200, aliases: [] },
  { city: "Hathras", state: "Uttar Pradesh", country: "India", lat: 27.5963, lng: 78.0519, aliases: [] },
  { city: "Etah", state: "Uttar Pradesh", country: "India", lat: 27.5600, lng: 78.6600, aliases: [] },
  { city: "Ballia", state: "Uttar Pradesh", country: "India", lat: 25.7600, lng: 84.1500, aliases: [] },
  { city: "Gonda", state: "Uttar Pradesh", country: "India", lat: 27.1340, lng: 81.9619, aliases: [] },
  { city: "Mau", state: "Uttar Pradesh", country: "India", lat: 25.9416, lng: 83.5616, aliases: [] },
  { city: "Lalitpur", state: "Uttar Pradesh", country: "India", lat: 24.6875, lng: 78.4152, aliases: [] },
  { city: "Hapur", state: "Uttar Pradesh", country: "India", lat: 28.7308, lng: 77.7750, aliases: [] },
 
  // ─── Uttarakhand ───
  { city: "Dehradun", state: "Uttarakhand", country: "India", lat: 30.3165, lng: 78.0322, aliases: [] },
  { city: "Haridwar", state: "Uttarakhand", country: "India", lat: 29.9457, lng: 78.1642, aliases: ["hardwar"] },
  { city: "Roorkee", state: "Uttarakhand", country: "India", lat: 29.8543, lng: 77.888, aliases: [] },
  { city: "Haldwani", state: "Uttarakhand", country: "India", lat: 29.2183, lng: 79.5130, aliases: [] },
  { city: "Rudrapur", state: "Uttarakhand", country: "India", lat: 28.9750, lng: 79.3990, aliases: [] },
  { city: "Kashipur", state: "Uttarakhand", country: "India", lat: 29.2104, lng: 78.9618, aliases: [] },
  { city: "Rishikesh", state: "Uttarakhand", country: "India", lat: 30.0869, lng: 78.2676, aliases: [] },
  { city: "Nainital", state: "Uttarakhand", country: "India", lat: 29.3919, lng: 79.4542, aliases: [] },
  { city: "Mussoorie", state: "Uttarakhand", country: "India", lat: 30.4598, lng: 78.0644, aliases: [] },
  { city: "Pithoragarh", state: "Uttarakhand", country: "India", lat: 29.5829, lng: 80.2182, aliases: [] },
  { city: "Almora", state: "Uttarakhand", country: "India", lat: 29.5971, lng: 79.6591, aliases: [] },
  { city: "Kotdwar", state: "Uttarakhand", country: "India", lat: 29.7466, lng: 78.5257, aliases: [] },
  { city: "Ramnagar", state: "Uttarakhand", country: "India", lat: 29.3956, lng: 79.1274, aliases: [] },
  { city: "Srinagar", state: "Uttarakhand", country: "India", lat: 30.2190, lng: 78.7880, aliases: [] },
  { city: "Jaspur", state: "Uttarakhand", country: "India", lat: 29.2800, lng: 78.8300, aliases: [] },
 
  // ─── West Bengal ───
  { city: "Kolkata", state: "West Bengal", country: "India", lat: 22.5726, lng: 88.3639, aliases: ["calcutta"] },
  { city: "Howrah", state: "West Bengal", country: "India", lat: 22.5958, lng: 88.2636, aliases: [] },
  { city: "Durgapur", state: "West Bengal", country: "India", lat: 23.5204, lng: 87.3119, aliases: [] },
  { city: "Asansol", state: "West Bengal", country: "India", lat: 23.6739, lng: 86.9524, aliases: [] },
  { city: "Siliguri", state: "West Bengal", country: "India", lat: 26.7271, lng: 88.3953, aliases: [] },
  { city: "Bardhaman", state: "West Bengal", country: "India", lat: 23.2324, lng: 87.8615, aliases: ["burdwan"] },
  { city: "Malda", state: "West Bengal", country: "India", lat: 25.0108, lng: 88.1411, aliases: ["english bazar"] },
  { city: "Baharampur", state: "West Bengal", country: "India", lat: 24.1039, lng: 88.2517, aliases: ["berhampore"] },
  { city: "Habra", state: "West Bengal", country: "India", lat: 22.8400, lng: 88.6300, aliases: [] },
  { city: "Kharagpur", state: "West Bengal", country: "India", lat: 22.3460, lng: 87.3236, aliases: [] },
  { city: "Shantipur", state: "West Bengal", country: "India", lat: 23.2517, lng: 88.4324, aliases: [] },
  { city: "Darjeeling", state: "West Bengal", country: "India", lat: 27.0410, lng: 88.2663, aliases: [] },
  { city: "Barrackpore", state: "West Bengal", country: "India", lat: 22.7604, lng: 88.3704, aliases: [] },
  { city: "Haldia", state: "West Bengal", country: "India", lat: 22.0257, lng: 88.0583, aliases: [] },
  { city: "Raiganj", state: "West Bengal", country: "India", lat: 25.6200, lng: 88.1200, aliases: [] },
  { city: "Krishnanagar", state: "West Bengal", country: "India", lat: 23.4000, lng: 88.5000, aliases: [] },
  { city: "Nabadwip", state: "West Bengal", country: "India", lat: 23.4074, lng: 88.3653, aliases: [] },
  { city: "Medinipur", state: "West Bengal", country: "India", lat: 22.4250, lng: 87.3200, aliases: ["midnapore"] },
  { city: "Balurghat", state: "West Bengal", country: "India", lat: 25.2232, lng: 88.7646, aliases: [] },
  { city: "Bankura", state: "West Bengal", country: "India", lat: 23.2324, lng: 87.0717, aliases: [] },
  { city: "Bolpur", state: "West Bengal", country: "India", lat: 23.6693, lng: 87.7200, aliases: ["shantiniketan"] },
  { city: "Jalpaiguri", state: "West Bengal", country: "India", lat: 26.5167, lng: 88.7333, aliases: [] },
  { city: "Cooch Behar", state: "West Bengal", country: "India", lat: 26.3250, lng: 89.4467, aliases: [] },
  { city: "Purulia", state: "West Bengal", country: "India", lat: 23.3333, lng: 86.3667, aliases: [] },
  { city: "Raniganj", state: "West Bengal", country: "India", lat: 23.6200, lng: 87.1300, aliases: [] },
  { city: "Tamluk", state: "West Bengal", country: "India", lat: 22.2800, lng: 87.9200, aliases: [] },
  { city: "Basirhat", state: "West Bengal", country: "India", lat: 22.6572, lng: 88.8695, aliases: [] },
  { city: "Contai", state: "West Bengal", country: "India", lat: 21.7800, lng: 87.7500, aliases: [] },
  { city: "Alipurduar", state: "West Bengal", country: "India", lat: 26.4900, lng: 89.5300, aliases: [] },
  { city: "Kalimpong", state: "West Bengal", country: "India", lat: 27.0594, lng: 88.4695, aliases: [] },
  { city: "Diamond Harbour", state: "West Bengal", country: "India", lat: 22.1900, lng: 88.1900, aliases: [] },
  { city: "Baruipur", state: "West Bengal", country: "India", lat: 22.3640, lng: 88.4320, aliases: [] },
  { city: "Bishnupur", state: "West Bengal", country: "India", lat: 23.0800, lng: 87.3200, aliases: [] },
 
  // ─── Union Territories ───
  { city: "Delhi", state: "Delhi", country: "India", lat: 28.7041, lng: 77.1025, aliases: ["new delhi", "delhi-ncr", "delhi ncr", "ncr"] },
  { city: "Chandigarh", state: "Chandigarh", country: "India", lat: 30.7333, lng: 76.7794, aliases: [] },
  { city: "Srinagar", state: "Jammu & Kashmir", country: "India", lat: 34.0837, lng: 74.7973, aliases: [] },
  { city: "Jammu", state: "Jammu & Kashmir", country: "India", lat: 32.7266, lng: 74.857, aliases: [] },
  { city: "Anantnag", state: "Jammu & Kashmir", country: "India", lat: 33.7311, lng: 75.1487, aliases: [] },
  { city: "Baramulla", state: "Jammu & Kashmir", country: "India", lat: 34.2000, lng: 74.3600, aliases: [] },
  { city: "Sopore", state: "Jammu & Kashmir", country: "India", lat: 34.3000, lng: 74.4700, aliases: [] },
  { city: "Kathua", state: "Jammu & Kashmir", country: "India", lat: 32.3868, lng: 75.5196, aliases: [] },
  { city: "Udhampur", state: "Jammu & Kashmir", country: "India", lat: 32.9160, lng: 75.1322, aliases: [] },
  { city: "Leh", state: "Ladakh", country: "India", lat: 34.1526, lng: 77.5771, aliases: [] },
  { city: "Kargil", state: "Ladakh", country: "India", lat: 34.5539, lng: 76.1349, aliases: [] },
  { city: "Port Blair", state: "Andaman & Nicobar Islands", country: "India", lat: 11.6234, lng: 92.7265, aliases: [] },
  { city: "Kavaratti", state: "Lakshadweep", country: "India", lat: 10.5626, lng: 72.6369, aliases: [] },
  { city: "Daman", state: "Dadra & Nagar Haveli and Daman & Diu", country: "India", lat: 20.4143, lng: 72.8322, aliases: [] },
  { city: "Silvassa", state: "Dadra & Nagar Haveli and Daman & Diu", country: "India", lat: 20.2738, lng: 73.0169, aliases: [] },
  { city: "Diu", state: "Dadra & Nagar Haveli and Daman & Diu", country: "India", lat: 20.7141, lng: 70.9875, aliases: [] },
 
  // ═══════════════════════════════════════════════════════════
  // GLOBAL — MAJOR CITIES BY COUNTRY
  // ═══════════════════════════════════════════════════════════
 
  // ─── USA ───
  { city: "New York", state: "New York", country: "USA", lat: 40.7128, lng: -74.006, aliases: ["nyc"] },
  { city: "Los Angeles", state: "California", country: "USA", lat: 34.0522, lng: -118.2437, aliases: ["la"] },
  { city: "Chicago", state: "Illinois", country: "USA", lat: 41.8781, lng: -87.6298, aliases: [] },
  { city: "Houston", state: "Texas", country: "USA", lat: 29.7604, lng: -95.3698, aliases: [] },
  { city: "Phoenix", state: "Arizona", country: "USA", lat: 33.4484, lng: -112.074, aliases: [] },
  { city: "Philadelphia", state: "Pennsylvania", country: "USA", lat: 39.9526, lng: -75.1652, aliases: ["philly"] },
  { city: "San Antonio", state: "Texas", country: "USA", lat: 29.4241, lng: -98.4936, aliases: [] },
  { city: "San Diego", state: "California", country: "USA", lat: 32.7157, lng: -117.1611, aliases: [] },
  { city: "Dallas", state: "Texas", country: "USA", lat: 32.7767, lng: -96.797, aliases: [] },
  { city: "San Francisco", state: "California", country: "USA", lat: 37.7749, lng: -122.4194, aliases: ["sf"] },
  { city: "Austin", state: "Texas", country: "USA", lat: 30.2672, lng: -97.7431, aliases: [] },
  { city: "Seattle", state: "Washington", country: "USA", lat: 47.6062, lng: -122.3321, aliases: [] },
  { city: "Denver", state: "Colorado", country: "USA", lat: 39.7392, lng: -104.9903, aliases: [] },
  { city: "Boston", state: "Massachusetts", country: "USA", lat: 42.3601, lng: -71.0589, aliases: [] },
  { city: "Nashville", state: "Tennessee", country: "USA", lat: 36.1627, lng: -86.7816, aliases: [] },
  { city: "Washington DC", state: "District of Columbia", country: "USA", lat: 38.9072, lng: -77.0369, aliases: ["dc"] },
  { city: "Miami", state: "Florida", country: "USA", lat: 25.7617, lng: -80.1918, aliases: [] },
  { city: "Atlanta", state: "Georgia", country: "USA", lat: 33.749, lng: -84.388, aliases: [] },
  { city: "Portland", state: "Oregon", country: "USA", lat: 45.5152, lng: -122.6784, aliases: [] },
  { city: "Las Vegas", state: "Nevada", country: "USA", lat: 36.1699, lng: -115.1398, aliases: [] },
  { city: "Minneapolis", state: "Minnesota", country: "USA", lat: 44.9778, lng: -93.265, aliases: [] },
  { city: "Detroit", state: "Michigan", country: "USA", lat: 42.3314, lng: -83.0458, aliases: [] },
  { city: "San Jose", state: "California", country: "USA", lat: 37.3382, lng: -121.8863, aliases: [] },
  { city: "Charlotte", state: "North Carolina", country: "USA", lat: 35.2271, lng: -80.8431, aliases: [] },
  { city: "Orlando", state: "Florida", country: "USA", lat: 28.5383, lng: -81.3792, aliases: [] },
  { city: "Salt Lake City", state: "Utah", country: "USA", lat: 40.7608, lng: -111.891, aliases: ["slc"] },
  { city: "Raleigh", state: "North Carolina", country: "USA", lat: 35.7796, lng: -78.6382, aliases: [] },
  { city: "Pittsburgh", state: "Pennsylvania", country: "USA", lat: 40.4406, lng: -79.9959, aliases: [] },
  { city: "Indianapolis", state: "Indiana", country: "USA", lat: 39.7684, lng: -86.1581, aliases: ["indy"] },
  { city: "Columbus", state: "Ohio", country: "USA", lat: 39.9612, lng: -82.9988, aliases: [] },
 
  // ─── UK ───
  { city: "London", state: "England", country: "UK", lat: 51.5074, lng: -0.1278, aliases: [] },
  { city: "Manchester", state: "England", country: "UK", lat: 53.4808, lng: -2.2426, aliases: [] },
  { city: "Birmingham", state: "England", country: "UK", lat: 52.4862, lng: -1.8904, aliases: [] },
  { city: "Edinburgh", state: "Scotland", country: "UK", lat: 55.9533, lng: -3.1883, aliases: [] },
  { city: "Glasgow", state: "Scotland", country: "UK", lat: 55.8642, lng: -4.2518, aliases: [] },
  { city: "Liverpool", state: "England", country: "UK", lat: 53.4084, lng: -2.9916, aliases: [] },
  { city: "Bristol", state: "England", country: "UK", lat: 51.4545, lng: -2.5879, aliases: [] },
  { city: "Leeds", state: "England", country: "UK", lat: 53.8008, lng: -1.5491, aliases: [] },
  { city: "Cardiff", state: "Wales", country: "UK", lat: 51.4816, lng: -3.1791, aliases: [] },
  { city: "Belfast", state: "Northern Ireland", country: "UK", lat: 54.5973, lng: -5.9301, aliases: [] },
  { city: "Newcastle", state: "England", country: "UK", lat: 54.9783, lng: -1.6178, aliases: [] },
  { city: "Sheffield", state: "England", country: "UK", lat: 53.3811, lng: -1.4701, aliases: [] },
  { city: "Cambridge", state: "England", country: "UK", lat: 52.2053, lng: 0.1218, aliases: [] },
  { city: "Oxford", state: "England", country: "UK", lat: 51.752, lng: -1.2577, aliases: [] },
  { city: "Nottingham", state: "England", country: "UK", lat: 52.9548, lng: -1.1581, aliases: [] },
 
  // ─── Canada ───
  { city: "Toronto", state: "Ontario", country: "Canada", lat: 43.6532, lng: -79.3832, aliases: [] },
  { city: "Vancouver", state: "British Columbia", country: "Canada", lat: 49.2827, lng: -123.1207, aliases: [] },
  { city: "Montreal", state: "Quebec", country: "Canada", lat: 45.5017, lng: -73.5673, aliases: [] },
  { city: "Calgary", state: "Alberta", country: "Canada", lat: 51.0447, lng: -114.0719, aliases: [] },
  { city: "Ottawa", state: "Ontario", country: "Canada", lat: 45.4215, lng: -75.6972, aliases: [] },
  { city: "Edmonton", state: "Alberta", country: "Canada", lat: 53.5461, lng: -113.4938, aliases: [] },
  { city: "Winnipeg", state: "Manitoba", country: "Canada", lat: 49.8951, lng: -97.1384, aliases: [] },
  { city: "Quebec City", state: "Quebec", country: "Canada", lat: 46.8139, lng: -71.2082, aliases: [] },
  { city: "Halifax", state: "Nova Scotia", country: "Canada", lat: 44.6488, lng: -63.5752, aliases: [] },
  { city: "Victoria", state: "British Columbia", country: "Canada", lat: 48.4284, lng: -123.3656, aliases: [] },
  { city: "Waterloo", state: "Ontario", country: "Canada", lat: 43.4643, lng: -80.5204, aliases: [] },
 
  // ─── Germany ───
  { city: "Berlin", state: "Berlin", country: "Germany", lat: 52.52, lng: 13.405, aliases: [] },
  { city: "Munich", state: "Bavaria", country: "Germany", lat: 48.1351, lng: 11.582, aliases: ["münchen"] },
  { city: "Frankfurt", state: "Hesse", country: "Germany", lat: 50.1109, lng: 8.6821, aliases: [] },
  { city: "Hamburg", state: "Hamburg", country: "Germany", lat: 53.5511, lng: 9.9937, aliases: [] },
  { city: "Cologne", state: "NRW", country: "Germany", lat: 50.9375, lng: 6.9603, aliases: ["köln"] },
  { city: "Stuttgart", state: "Baden-Württemberg", country: "Germany", lat: 48.7758, lng: 9.1829, aliases: [] },
  { city: "Düsseldorf", state: "NRW", country: "Germany", lat: 51.2277, lng: 6.7735, aliases: [] },
 
  // ─── France ───
  { city: "Paris", state: "Île-de-France", country: "France", lat: 48.8566, lng: 2.3522, aliases: [] },
  { city: "Lyon", state: "Auvergne-Rhône-Alpes", country: "France", lat: 45.764, lng: 4.8357, aliases: [] },
  { city: "Marseille", state: "Provence-Alpes-Côte d'Azur", country: "France", lat: 43.2965, lng: 5.3698, aliases: [] },
  { city: "Toulouse", state: "Occitanie", country: "France", lat: 43.6047, lng: 1.4442, aliases: [] },
  { city: "Nice", state: "Provence-Alpes-Côte d'Azur", country: "France", lat: 43.7102, lng: 7.262, aliases: [] },
  { city: "Bordeaux", state: "Nouvelle-Aquitaine", country: "France", lat: 44.8378, lng: -0.5792, aliases: [] },
  { city: "Strasbourg", state: "Grand Est", country: "France", lat: 48.5734, lng: 7.7521, aliases: [] },
 
  // ─── Netherlands ───
  { city: "Amsterdam", state: "North Holland", country: "Netherlands", lat: 52.3676, lng: 4.9041, aliases: [] },
  { city: "Rotterdam", state: "South Holland", country: "Netherlands", lat: 51.9244, lng: 4.4777, aliases: [] },
  { city: "The Hague", state: "South Holland", country: "Netherlands", lat: 52.0705, lng: 4.3007, aliases: ["den haag"] },
  { city: "Utrecht", state: "Utrecht", country: "Netherlands", lat: 52.0907, lng: 5.1214, aliases: [] },
  { city: "Eindhoven", state: "North Brabant", country: "Netherlands", lat: 51.4416, lng: 5.4697, aliases: [] },
 
  // ─── Spain ───
  { city: "Madrid", state: "Madrid", country: "Spain", lat: 40.4168, lng: -3.7038, aliases: [] },
  { city: "Barcelona", state: "Catalonia", country: "Spain", lat: 41.3874, lng: 2.1686, aliases: [] },
  { city: "Valencia", state: "Valencia", country: "Spain", lat: 39.4699, lng: -0.3763, aliases: [] },
  { city: "Seville", state: "Andalusia", country: "Spain", lat: 37.3891, lng: -5.9845, aliases: ["sevilla"] },
  { city: "Málaga", state: "Andalusia", country: "Spain", lat: 36.7213, lng: -4.4214, aliases: ["malaga"] },
 
  // ─── Italy ───
  { city: "Rome", state: "Lazio", country: "Italy", lat: 41.9028, lng: 12.4964, aliases: ["roma"] },
  { city: "Milan", state: "Lombardy", country: "Italy", lat: 45.4642, lng: 9.19, aliases: ["milano"] },
  { city: "Naples", state: "Campania", country: "Italy", lat: 40.8518, lng: 14.2681, aliases: ["napoli"] },
  { city: "Turin", state: "Piedmont", country: "Italy", lat: 45.0703, lng: 7.6869, aliases: ["torino"] },
  { city: "Florence", state: "Tuscany", country: "Italy", lat: 43.7696, lng: 11.2558, aliases: ["firenze"] },
 
  // ─── Sweden ───
  { city: "Stockholm", state: "Stockholm", country: "Sweden", lat: 59.3293, lng: 18.0686, aliases: [] },
  { city: "Gothenburg", state: "Västra Götaland", country: "Sweden", lat: 57.7089, lng: 11.9746, aliases: ["göteborg"] },
  { city: "Malmö", state: "Skåne", country: "Sweden", lat: 55.6049, lng: 13.0038, aliases: [] },
 
  // ─── Switzerland ───
  { city: "Zurich", state: "Zurich", country: "Switzerland", lat: 47.3769, lng: 8.5417, aliases: ["zürich"] },
  { city: "Geneva", state: "Geneva", country: "Switzerland", lat: 46.2044, lng: 6.1432, aliases: [] },
  { city: "Basel", state: "Basel-Stadt", country: "Switzerland", lat: 47.5596, lng: 7.5886, aliases: [] },
  { city: "Bern", state: "Bern", country: "Switzerland", lat: 46.9481, lng: 7.4474, aliases: [] },
 
  // ─── Ireland ───
  { city: "Dublin", state: "Leinster", country: "Ireland", lat: 53.3498, lng: -6.2603, aliases: [] },
  { city: "Cork", state: "Munster", country: "Ireland", lat: 51.8969, lng: -8.4863, aliases: [] },
  { city: "Galway", state: "Connacht", country: "Ireland", lat: 53.2707, lng: -9.0568, aliases: [] },
 
  // ─── Portugal ───
  { city: "Lisbon", state: "Lisbon", country: "Portugal", lat: 38.7223, lng: -9.1393, aliases: ["lisboa"] },
  { city: "Porto", state: "Porto", country: "Portugal", lat: 41.1579, lng: -8.6291, aliases: [] },
 
  // ─── Poland ───
  { city: "Warsaw", state: "Masovia", country: "Poland", lat: 52.2297, lng: 21.0122, aliases: ["warszawa"] },
  { city: "Krakow", state: "Lesser Poland", country: "Poland", lat: 50.0647, lng: 19.945, aliases: ["kraków"] },
  { city: "Wroclaw", state: "Lower Silesia", country: "Poland", lat: 51.1079, lng: 17.0385, aliases: ["wrocław"] },
  { city: "Gdansk", state: "Pomerania", country: "Poland", lat: 54.352, lng: 18.6466, aliases: ["gdańsk"] },
 
  // ─── Czech Republic ───
  { city: "Prague", state: "Prague", country: "Czech Republic", lat: 50.0755, lng: 14.4378, aliases: ["praha"] },
  { city: "Brno", state: "South Moravia", country: "Czech Republic", lat: 49.1951, lng: 16.6068, aliases: [] },
 
  // ─── Austria ───
  { city: "Vienna", state: "Vienna", country: "Austria", lat: 48.2082, lng: 16.3738, aliases: ["wien"] },
  { city: "Salzburg", state: "Salzburg", country: "Austria", lat: 47.8095, lng: 13.055, aliases: [] },
 
  // ─── Belgium ───
  { city: "Brussels", state: "Brussels", country: "Belgium", lat: 50.8503, lng: 4.3517, aliases: ["bruxelles"] },
  { city: "Antwerp", state: "Flanders", country: "Belgium", lat: 51.2194, lng: 4.4025, aliases: ["antwerpen"] },
 
  // ─── Denmark ───
  { city: "Copenhagen", state: "Capital Region", country: "Denmark", lat: 55.6761, lng: 12.5683, aliases: ["københavn", "greater copenhagen"] },
  { city: "Aarhus", state: "Central Denmark", country: "Denmark", lat: 56.1629, lng: 10.2039, aliases: [] },
 
  // ─── Norway ───
  { city: "Oslo", state: "Oslo", country: "Norway", lat: 59.9139, lng: 10.7522, aliases: [] },
  { city: "Bergen", state: "Vestland", country: "Norway", lat: 60.3913, lng: 5.3221, aliases: [] },
 
  // ─── Finland ───
  { city: "Helsinki", state: "Uusimaa", country: "Finland", lat: 60.1699, lng: 24.9384, aliases: [] },
  { city: "Tampere", state: "Pirkanmaa", country: "Finland", lat: 61.4978, lng: 23.761, aliases: [] },
 
  // ─── Greece ───
  { city: "Athens", state: "Attica", country: "Greece", lat: 37.9838, lng: 23.7275, aliases: [] },
  { city: "Thessaloniki", state: "Central Macedonia", country: "Greece", lat: 40.6401, lng: 22.9444, aliases: [] },
 
  // ─── Turkey ───
  { city: "Istanbul", state: "Istanbul", country: "Turkey", lat: 41.0082, lng: 28.9784, aliases: ["maslak"] },
  { city: "Ankara", state: "Ankara", country: "Turkey", lat: 39.9334, lng: 32.8597, aliases: [] },
  { city: "Izmir", state: "Izmir", country: "Turkey", lat: 38.4237, lng: 27.1428, aliases: [] },
 
  // ─── Romania ───
  { city: "Bucharest", state: "Bucharest", country: "Romania", lat: 44.4268, lng: 26.1025, aliases: ["bucurești"] },
  { city: "Cluj-Napoca", state: "Cluj", country: "Romania", lat: 46.7712, lng: 23.6236, aliases: [] },
 
  // ─── Hungary ───
  { city: "Budapest", state: "Budapest", country: "Hungary", lat: 47.4979, lng: 19.0402, aliases: [] },
 
  // ─── Ukraine ───
  { city: "Kyiv", state: "Kyiv", country: "Ukraine", lat: 50.4501, lng: 30.5234, aliases: ["kiev"] },
  { city: "Lviv", state: "Lviv", country: "Ukraine", lat: 49.8397, lng: 24.0297, aliases: [] },
 
  // ─── Russia ───
  { city: "Moscow", state: "Moscow", country: "Russia", lat: 55.7558, lng: 37.6173, aliases: [] },
  { city: "Saint Petersburg", state: "Saint Petersburg", country: "Russia", lat: 59.9343, lng: 30.3351, aliases: ["st petersburg"] },
 
  // ─── Japan ───
  { city: "Tokyo", state: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503, aliases: [] },
  { city: "Osaka", state: "Osaka", country: "Japan", lat: 34.6937, lng: 135.5023, aliases: [] },
  { city: "Kyoto", state: "Kyoto", country: "Japan", lat: 35.0116, lng: 135.7681, aliases: [] },
  { city: "Yokohama", state: "Kanagawa", country: "Japan", lat: 35.4437, lng: 139.638, aliases: [] },
  { city: "Nagoya", state: "Aichi", country: "Japan", lat: 35.1815, lng: 136.9066, aliases: [] },
  { city: "Fukuoka", state: "Fukuoka", country: "Japan", lat: 33.5904, lng: 130.4017, aliases: [] },
  { city: "Sapporo", state: "Hokkaido", country: "Japan", lat: 43.0618, lng: 141.3545, aliases: [] },
 
  // ─── China ───
  { city: "Beijing", state: "Beijing", country: "China", lat: 39.9042, lng: 116.4074, aliases: ["peking"] },
  { city: "Shanghai", state: "Shanghai", country: "China", lat: 31.2304, lng: 121.4737, aliases: [] },
  { city: "Shenzhen", state: "Guangdong", country: "China", lat: 22.5431, lng: 114.0579, aliases: [] },
  { city: "Guangzhou", state: "Guangdong", country: "China", lat: 23.1291, lng: 113.2644, aliases: ["canton"] },
  { city: "Chengdu", state: "Sichuan", country: "China", lat: 30.5728, lng: 104.0668, aliases: [] },
  { city: "Hangzhou", state: "Zhejiang", country: "China", lat: 30.2741, lng: 120.1551, aliases: [] },
  { city: "Hong Kong", state: "Hong Kong", country: "Hong Kong", lat: 22.3193, lng: 114.1694, aliases: ["hk", "kwun tong", "kwai chung", "wan chai"] },
 
  // ─── South Korea ───
  { city: "Seoul", state: "Seoul", country: "South Korea", lat: 37.5665, lng: 126.978, aliases: [] },
  { city: "Busan", state: "Busan", country: "South Korea", lat: 35.1796, lng: 129.0756, aliases: [] },
  { city: "Incheon", state: "Incheon", country: "South Korea", lat: 37.4563, lng: 126.7052, aliases: [] },
 
  // ─── Singapore ───
  { city: "Singapore", state: "Singapore", country: "Singapore", lat: 1.3521, lng: 103.8198, aliases: ["sg"] },
 
  // ─── Malaysia ───
  { city: "Kuala Lumpur", state: "Kuala Lumpur", country: "Malaysia", lat: 3.139, lng: 101.6869, aliases: ["kl"] },
  { city: "George Town", state: "Penang", country: "Malaysia", lat: 5.4164, lng: 100.3327, aliases: ["penang"] },
  { city: "Johor Bahru", state: "Johor", country: "Malaysia", lat: 1.4927, lng: 103.7414, aliases: ["jb"] },
 
  // ─── Indonesia ───
  { city: "Jakarta", state: "Jakarta", country: "Indonesia", lat: -6.2088, lng: 106.8456, aliases: [] },
  { city: "Surabaya", state: "East Java", country: "Indonesia", lat: -7.2575, lng: 112.7521, aliases: [] },
  { city: "Bandung", state: "West Java", country: "Indonesia", lat: -6.9175, lng: 107.6191, aliases: [] },
  { city: "Bali", state: "Bali", country: "Indonesia", lat: -8.3405, lng: 115.092, aliases: ["denpasar"] },
  { city: "Yogyakarta", state: "Yogyakarta", country: "Indonesia", lat: -7.7956, lng: 110.3695, aliases: ["jogja"] },
 
  // ─── Thailand ───
  { city: "Bangkok", state: "Bangkok", country: "Thailand", lat: 13.7563, lng: 100.5018, aliases: [] },
  { city: "Chiang Mai", state: "Chiang Mai", country: "Thailand", lat: 18.7883, lng: 98.9853, aliases: [] },
  { city: "Phuket", state: "Phuket", country: "Thailand", lat: 7.8804, lng: 98.3923, aliases: [] },
 
  // ─── Vietnam ───
  { city: "Ho Chi Minh City", state: "Ho Chi Minh", country: "Vietnam", lat: 10.8231, lng: 106.6297, aliases: ["saigon", "hcmc"] },
  { city: "Hanoi", state: "Hanoi", country: "Vietnam", lat: 21.0278, lng: 105.8342, aliases: [] },
  { city: "Da Nang", state: "Da Nang", country: "Vietnam", lat: 16.0544, lng: 108.2022, aliases: [] },
 
  // ─── Philippines ───
  { city: "Manila", state: "Metro Manila", country: "Philippines", lat: 14.5995, lng: 120.9842, aliases: [] },
  { city: "Cebu City", state: "Cebu", country: "Philippines", lat: 10.3157, lng: 123.8854, aliases: [] },
  { city: "Davao City", state: "Davao del Sur", country: "Philippines", lat: 7.1907, lng: 125.4553, aliases: [] },
 
  // ─── Taiwan ───
  { city: "Taipei", state: "Taipei", country: "Taiwan", lat: 25.033, lng: 121.5654, aliases: [] },
  { city: "Kaohsiung", state: "Kaohsiung", country: "Taiwan", lat: 22.6273, lng: 120.3014, aliases: [] },
 
  // ─── Pakistan ───
  { city: "Karachi", state: "Sindh", country: "Pakistan", lat: 24.8607, lng: 67.0011, aliases: [] },
  { city: "Lahore", state: "Punjab", country: "Pakistan", lat: 31.5204, lng: 74.3587, aliases: [] },
  { city: "Islamabad", state: "Islamabad", country: "Pakistan", lat: 33.6844, lng: 73.0479, aliases: [] },
  { city: "Rawalpindi", state: "Punjab", country: "Pakistan", lat: 33.5651, lng: 73.0169, aliases: ["pindi"] },
  { city: "Faisalabad", state: "Punjab", country: "Pakistan", lat: 31.4187, lng: 73.079, aliases: [] },
  { city: "Peshawar", state: "Khyber Pakhtunkhwa", country: "Pakistan", lat: 34.0151, lng: 71.5249, aliases: [] },
 
  // ─── Bangladesh ───
  { city: "Dhaka", state: "Dhaka", country: "Bangladesh", lat: 23.8103, lng: 90.4125, aliases: ["dacca"] },
  { city: "Chittagong", state: "Chittagong", country: "Bangladesh", lat: 22.3569, lng: 91.7832, aliases: ["chattogram"] },
  { city: "Sylhet", state: "Sylhet", country: "Bangladesh", lat: 24.8949, lng: 91.8687, aliases: [] },
 
  // ─── Sri Lanka ───
  { city: "Colombo", state: "Western", country: "Sri Lanka", lat: 6.9271, lng: 79.8612, aliases: [] },
  { city: "Kandy", state: "Central", country: "Sri Lanka", lat: 7.2906, lng: 80.6337, aliases: [] },
 
  // ─── Nepal ───
  { city: "Kathmandu", state: "Bagmati", country: "Nepal", lat: 27.7172, lng: 85.324, aliases: [] },
  { city: "Pokhara", state: "Gandaki", country: "Nepal", lat: 28.2096, lng: 83.9856, aliases: [] },
 
  // ─── UAE ───
  { city: "Dubai", state: "Dubai", country: "UAE", lat: 25.2048, lng: 55.2708, aliases: [] },
  { city: "Abu Dhabi", state: "Abu Dhabi", country: "UAE", lat: 24.4539, lng: 54.3773, aliases: [] },
  { city: "Sharjah", state: "Sharjah", country: "UAE", lat: 25.3463, lng: 55.4209, aliases: [] },
 
  // ─── Saudi Arabia ───
  { city: "Riyadh", state: "Riyadh", country: "Saudi Arabia", lat: 24.7136, lng: 46.6753, aliases: [] },
  { city: "Jeddah", state: "Makkah", country: "Saudi Arabia", lat: 21.4858, lng: 39.1925, aliases: [] },
  { city: "Dammam", state: "Eastern", country: "Saudi Arabia", lat: 26.3927, lng: 49.9777, aliases: [] },
 
  // ─── Qatar ───
  { city: "Doha", state: "Doha", country: "Qatar", lat: 25.2854, lng: 51.531, aliases: [] },
 
  // ─── Bahrain ───
  { city: "Manama", state: "Capital", country: "Bahrain", lat: 26.2285, lng: 50.586, aliases: [] },
 
  // ─── Kuwait ───
  { city: "Kuwait City", state: "Al Asimah", country: "Kuwait", lat: 29.3759, lng: 47.9774, aliases: [] },
 
  // ─── Oman ───
  { city: "Muscat", state: "Muscat", country: "Oman", lat: 23.5880, lng: 58.3829, aliases: [] },
 
  // ─── Israel ───
  { city: "Tel Aviv", state: "Tel Aviv", country: "Israel", lat: 32.0853, lng: 34.7818, aliases: [] },
  { city: "Jerusalem", state: "Jerusalem", country: "Israel", lat: 31.7683, lng: 35.2137, aliases: [] },
 
  // ─── Australia ───
  { city: "Sydney", state: "NSW", country: "Australia", lat: -33.8688, lng: 151.2093, aliases: [] },
  { city: "Melbourne", state: "Victoria", country: "Australia", lat: -37.8136, lng: 144.9631, aliases: [] },
  { city: "Brisbane", state: "Queensland", country: "Australia", lat: -27.4698, lng: 153.0251, aliases: [] },
  { city: "Perth", state: "Western Australia", country: "Australia", lat: -31.9505, lng: 115.8605, aliases: [] },
  { city: "Adelaide", state: "South Australia", country: "Australia", lat: -34.9285, lng: 138.6007, aliases: [] },
  { city: "Canberra", state: "ACT", country: "Australia", lat: -35.2809, lng: 149.13, aliases: [] },
 
  // ─── New Zealand ───
  { city: "Auckland", state: "Auckland", country: "New Zealand", lat: -36.8485, lng: 174.7633, aliases: [] },
  { city: "Wellington", state: "Wellington", country: "New Zealand", lat: -41.2865, lng: 174.7762, aliases: [] },
  { city: "Christchurch", state: "Canterbury", country: "New Zealand", lat: -43.5321, lng: 172.6362, aliases: [] },
 
  // ─── South Africa ───
  { city: "Cape Town", state: "Western Cape", country: "South Africa", lat: -33.9249, lng: 18.4241, aliases: [] },
  { city: "Johannesburg", state: "Gauteng", country: "South Africa", lat: -26.2041, lng: 28.0473, aliases: ["joburg"] },
  { city: "Durban", state: "KwaZulu-Natal", country: "South Africa", lat: -29.8587, lng: 31.0218, aliases: [] },
  { city: "Pretoria", state: "Gauteng", country: "South Africa", lat: -25.7479, lng: 28.2293, aliases: [] },
 
  // ─── Nigeria ───
  { city: "Lagos", state: "Lagos", country: "Nigeria", lat: 6.5244, lng: 3.3792, aliases: [] },
  { city: "Abuja", state: "FCT", country: "Nigeria", lat: 9.0765, lng: 7.3986, aliases: [] },
  { city: "Kano", state: "Kano", country: "Nigeria", lat: 12.0022, lng: 8.592, aliases: [] },
  { city: "Ibadan", state: "Oyo", country: "Nigeria", lat: 7.3775, lng: 3.947, aliases: [] },
  { city: "Port Harcourt", state: "Rivers", country: "Nigeria", lat: 4.8156, lng: 7.0498, aliases: [] },
 
  // ─── Kenya ───
  { city: "Nairobi", state: "Nairobi", country: "Kenya", lat: -1.2921, lng: 36.8219, aliases: [] },
  { city: "Mombasa", state: "Mombasa", country: "Kenya", lat: -4.0435, lng: 39.6682, aliases: [] },
 
  // ─── Egypt ───
  { city: "Cairo", state: "Cairo", country: "Egypt", lat: 30.0444, lng: 31.2357, aliases: [] },
  { city: "Alexandria", state: "Alexandria", country: "Egypt", lat: 31.2001, lng: 29.9187, aliases: [] },
 
  // ─── Ghana ───
  { city: "Accra", state: "Greater Accra", country: "Ghana", lat: 5.6037, lng: -0.187, aliases: [] },
 
  // ─── Ethiopia ───
  { city: "Addis Ababa", state: "Addis Ababa", country: "Ethiopia", lat: 9.0222, lng: 38.7468, aliases: [] },
 
  // ─── Tanzania ───
  { city: "Dar es Salaam", state: "Dar es Salaam", country: "Tanzania", lat: -6.7924, lng: 39.2083, aliases: [] },
 
  // ─── Rwanda ───
  { city: "Kigali", state: "Kigali", country: "Rwanda", lat: -1.9403, lng: 29.8739, aliases: [] },
 
  // ─── Morocco ───
  { city: "Casablanca", state: "Casablanca-Settat", country: "Morocco", lat: 33.5731, lng: -7.5898, aliases: [] },
  { city: "Marrakech", state: "Marrakech-Safi", country: "Morocco", lat: 31.6295, lng: -7.9811, aliases: [] },
 
  // ─── Tunisia ───
  { city: "Tunis", state: "Tunis", country: "Tunisia", lat: 36.8065, lng: 10.1815, aliases: [] },
 
  // ─── Brazil ───
  { city: "São Paulo", state: "São Paulo", country: "Brazil", lat: -23.5505, lng: -46.6333, aliases: ["sao paulo"] },
  { city: "Rio de Janeiro", state: "Rio de Janeiro", country: "Brazil", lat: -22.9068, lng: -43.1729, aliases: ["rio"] },
  { city: "Brasília", state: "Distrito Federal", country: "Brazil", lat: -15.7975, lng: -47.8919, aliases: [] },
  { city: "Belo Horizonte", state: "Minas Gerais", country: "Brazil", lat: -19.9167, lng: -43.9345, aliases: ["bh"] },
  { city: "Curitiba", state: "Paraná", country: "Brazil", lat: -25.4284, lng: -49.2733, aliases: [] },
  { city: "Recife", state: "Pernambuco", country: "Brazil", lat: -8.0476, lng: -34.877, aliases: [] },
  { city: "Porto Alegre", state: "Rio Grande do Sul", country: "Brazil", lat: -30.0346, lng: -51.2177, aliases: [] },
 
  // ─── Argentina ───
  { city: "Buenos Aires", state: "Buenos Aires", country: "Argentina", lat: -34.6037, lng: -58.3816, aliases: [] },
  { city: "Córdoba", state: "Córdoba", country: "Argentina", lat: -31.4201, lng: -64.1888, aliases: [] },
  { city: "Rosario", state: "Santa Fe", country: "Argentina", lat: -32.9468, lng: -60.6393, aliases: [] },
  { city: "Mendoza", state: "Mendoza", country: "Argentina", lat: -32.8895, lng: -68.8458, aliases: [] },
 
  // ─── Mexico ───
  { city: "Mexico City", state: "CDMX", country: "Mexico", lat: 19.4326, lng: -99.1332, aliases: ["cdmx"] },
  { city: "Guadalajara", state: "Jalisco", country: "Mexico", lat: 20.6597, lng: -103.3496, aliases: [] },
  { city: "Monterrey", state: "Nuevo León", country: "Mexico", lat: 25.6866, lng: -100.3161, aliases: [] },
  { city: "Cancún", state: "Quintana Roo", country: "Mexico", lat: 21.1619, lng: -86.8515, aliases: ["cancun"] },
  { city: "Puebla", state: "Puebla", country: "Mexico", lat: 19.0414, lng: -98.2063, aliases: [] },
  { city: "Tijuana", state: "Baja California", country: "Mexico", lat: 32.5149, lng: -117.0382, aliases: [] },
 
  // ─── Colombia ───
  { city: "Bogotá", state: "Cundinamarca", country: "Colombia", lat: 4.711, lng: -74.0721, aliases: ["bogota"] },
  { city: "Medellín", state: "Antioquia", country: "Colombia", lat: 6.2476, lng: -75.5658, aliases: ["medellin"] },
  { city: "Cali", state: "Valle del Cauca", country: "Colombia", lat: 3.4516, lng: -76.532, aliases: [] },
  { city: "Barranquilla", state: "Atlántico", country: "Colombia", lat: 10.9685, lng: -74.7813, aliases: [] },
 
  // ─── Chile ───
  { city: "Santiago", state: "Santiago", country: "Chile", lat: -33.4489, lng: -70.6693, aliases: [] },
  { city: "Valparaíso", state: "Valparaíso", country: "Chile", lat: -33.0472, lng: -71.6127, aliases: [] },
 
  // ─── Peru ───
  { city: "Lima", state: "Lima", country: "Peru", lat: -12.0464, lng: -77.0428, aliases: [] },
 
  // ─── Uruguay ───
  { city: "Montevideo", state: "Montevideo", country: "Uruguay", lat: -34.9011, lng: -56.1645, aliases: [] },
 
  // ─── Costa Rica ───
  { city: "San José", state: "San José", country: "Costa Rica", lat: 9.9281, lng: -84.0907, aliases: [] },
 
  // ─── Panama ───
  { city: "Panama City", state: "Panamá", country: "Panama", lat: 8.9824, lng: -79.5199, aliases: [] },
 
  // ─── Ecuador ───
  { city: "Quito", state: "Pichincha", country: "Ecuador", lat: -0.1807, lng: -78.4678, aliases: [] },
  { city: "Guayaquil", state: "Guayas", country: "Ecuador", lat: -2.1894, lng: -79.8891, aliases: [] },
  // ─── Tool headquarters (added Nov 2026, from the AI tools directory) ───
  { city: "Newark", country: "USA", aliases: [] },
  { city: "Foster City", country: "USA", aliases: [] },
  { city: "McLean", country: "USA", aliases: [] },
  { city: "Oakland", country: "USA", aliases: [] },
  { city: "Cupertino", country: "USA", aliases: [] },
  { city: "Henderson", country: "USA", aliases: [] },
  { city: "Menlo Park", country: "USA", aliases: [] },
  { city: "Arcadia", country: "USA", aliases: [] },
  { city: "Newbury Park", country: "USA", aliases: [] },
  { city: "Alpharetta", country: "USA", aliases: [] },
  { city: "Cleveland", country: "USA", aliases: [] },
  { city: "Addison", country: "USA", aliases: [] },
  { city: "New Castle", country: "USA", aliases: [] },
  { city: "Arlington", country: "USA", aliases: [] },
  { city: "Bellevue", country: "USA", aliases: [] },
  { city: "Alameda", country: "USA", aliases: [] },
  { city: "Somerville", country: "USA", aliases: [] },
  { city: "Surfside Beach", country: "USA", aliases: [] },
  { city: "Santa Monica", country: "USA", aliases: [] },
  { city: "Milwaukee", country: "USA", aliases: [] },
  { city: "Methuen", country: "USA", aliases: [] },
  { city: "Eden Prairie", country: "USA", aliases: [] },
  { city: "Cheyenne", country: "USA", aliases: [] },
  { city: "Excelsior", country: "USA", aliases: [] },
  { city: "Shoreline", country: "USA", aliases: [] },
  { city: "Bothell", country: "USA", aliases: [] },
  { city: "North Miami Beach", country: "USA", aliases: [] },
  { city: "Sarasota", country: "USA", aliases: [] },
  { city: "New Orleans", country: "USA", aliases: [] },
  { city: "Santa Barbara", country: "USA", aliases: [] },
  { city: "Des Moines", country: "USA", aliases: [] },
  { city: "Belmont", country: "USA", aliases: [] },
  { city: "Bend", country: "USA", aliases: [] },
  { city: "Albuquerque", country: "USA", aliases: [] },
  { city: "Daytona Beach", country: "USA", aliases: [] },
  { city: "Grand Rapids", country: "USA", aliases: [] },
  { city: "Columbia", country: "USA", aliases: [] },
  { city: "South El Monte", country: "USA", aliases: [] },
  { city: "West Hollywood", country: "USA", aliases: [] },
  { city: "Appleton", country: "USA", aliases: [] },
  { city: "Buford", country: "USA", aliases: [] },
  { city: "Cary", country: "USA", aliases: [] },
  { city: "Culver City", country: "USA", aliases: [] },
  { city: "San Carlos", country: "USA", aliases: [] },
  { city: "Reston", country: "USA", aliases: [] },
  { city: "Redmond", country: "USA", aliases: [] },
  { city: "Los Gatos", country: "USA", aliases: [] },
  { city: "Needham", country: "USA", aliases: [] },
  { city: "South Jordan", country: "USA", aliases: [] },
  { city: "El Segundo", country: "USA", aliases: [] },
  { city: "Jacksonville", country: "USA", aliases: [] },
  { city: "Boca Raton", country: "USA", aliases: [] },
  { city: "Richmond", country: "USA", aliases: [] },
  { city: "Boulder", country: "USA", aliases: [] },
  { city: "Altadena", country: "USA", aliases: [] },
  { city: "Carlsbad", country: "USA", aliases: [] },
  { city: "Greenville", country: "USA", aliases: [] },
  { city: "Burlingame", country: "USA", aliases: [] },
  { city: "Watertown", country: "USA", aliases: [] },
  { city: "Towson", country: "USA", aliases: [] },
  { city: "Boise", country: "USA", aliases: [] },
  { city: "St. Louis", country: "USA", aliases: ["st louis", "saint louis", "st. louis region"] },
  { city: "Dripping Springs", country: "USA", aliases: [] },
  { city: "Collingswood", country: "USA", aliases: [] },
  { city: "Southlake", country: "USA", aliases: [] },
  { city: "San Luis Obispo", country: "USA", aliases: [] },
  { city: "Apollo Beach", country: "USA", aliases: [] },
  { city: "Bakersfield", country: "USA", aliases: [] },
  { city: "Memphis", country: "USA", aliases: [] },
  { city: "Tallinn", country: "Estonia", aliases: [] },
  { city: "Limassol", country: "Cyprus", aliases: [] },
  { city: "Nicosia", country: "Cyprus", aliases: [] },
  { city: "Vilnius", country: "Lithuania", aliases: [] },
  { city: "Kaunas", country: "Lithuania", aliases: [] },
  { city: "Bratislava", country: "Slovakia", aliases: [] },
  { city: "Ramat Gan", country: "Israel", aliases: [] },
  { city: "Netanya", country: "Israel", aliases: [] },
  { city: "Herzliya", country: "Israel", aliases: [] },
  { city: "Zagreb", country: "Croatia", aliases: [] },
  { city: "Tbilisi", country: "Georgia", aliases: [] },
  { city: "Varna", country: "Bulgaria", aliases: [] },
  { city: "Nuremberg", country: "Germany", aliases: ["nürnberg", "nurnberg"] },
  { city: "Oberursel", country: "Germany", aliases: [] },
  { city: "Aichach", country: "Germany", aliases: [] },
  { city: "Essen", country: "Germany", aliases: [] },
  { city: "Tübingen", country: "Germany", aliases: ["tubingen", "tuebingen"] },
  { city: "Augsburg", country: "Germany", aliases: [] },
  { city: "Bonn", country: "Germany", aliases: [] },
  { city: "Pforzheim", country: "Germany", aliases: [] },
  { city: "Jena", country: "Germany", aliases: [] },
  { city: "Freiburg im Breisgau", country: "Germany", aliases: [] },
  { city: "Hanover", country: "Germany", aliases: ["hannover"] },
  { city: "İzmir", country: "Turkey", aliases: ["izmir"] },
  { city: "Wuhan", country: "China", aliases: [] },
  { city: "Nanjing", country: "China", aliases: [] },
  { city: "Ljubljana", country: "Slovenia", aliases: [] },
  { city: "Maribor", country: "Slovenia", aliases: [] },
  { city: "Aalborg", country: "Denmark", aliases: [] },
  { city: "Frederiksberg", country: "Denmark", aliases: [] },
  { city: "Ras Al Khaimah", country: "UAE", aliases: [] },
  { city: "Villars-sur-Glâne", country: "Switzerland", aliases: ["villars-sur-glane"] },
  { city: "Lausanne", country: "Switzerland", aliases: [] },
  { city: "Zug", country: "Switzerland", aliases: [] },
  { city: "Lucerne", country: "Switzerland", aliases: [] },
  { city: "Levallois-Perret", country: "France", aliases: [] },
  { city: "Neuilly-sur-Seine", country: "France", aliases: [] },
  { city: "Fresnes", country: "France", aliases: [] },
  { city: "Antibes", country: "France", aliases: [] },
  { city: "Maisons-Alfort", country: "France", aliases: [] },
  { city: "Grenoble", country: "France", aliases: [] },
  { city: "Chambéry", country: "France", aliases: ["chambery"] },
  { city: "Tours", country: "France", aliases: [] },
  { city: "Warrington", country: "UK", aliases: [] },
  { city: "Leicester", country: "UK", aliases: [] },
  { city: "Reading", country: "UK", aliases: [] },
  { city: "Newcastle upon Tyne", country: "UK", aliases: [] },
  { city: "Brighton", country: "UK", aliases: [] },
  { city: "Mildenhall", country: "UK", aliases: [] },
  { city: "Preston", country: "UK", aliases: [] },
  { city: "Marlborough", country: "UK", aliases: [] },
  { city: "Stafford", country: "UK", aliases: [] },
  { city: "Dnipro", country: "Ukraine", aliases: [] },
  { city: "Cherkasy", country: "Ukraine", aliases: [] },
  { city: "Leiden", country: "Netherlands", aliases: [] },
  { city: "Maastricht", country: "Netherlands", aliases: [] },
  { city: "Alkmaar", country: "Netherlands", aliases: [] },
  { city: "Linz", country: "Austria", aliases: [] },
  { city: "Fulpmes", country: "Austria", aliases: [] },
  { city: "Helsingborg", country: "Sweden", aliases: [] },
  { city: "Radom", country: "Poland", aliases: [] },
  { city: "Zamość", country: "Poland", aliases: ["zamosc"] },
  { city: "Valdemorillo", country: "Spain", aliases: [] },
  { city: "Bilbao", country: "Spain", aliases: [] },
  { city: "Ghent", country: "Belgium", aliases: ["gent"] },
  { city: "Tauranga", country: "New Zealand", aliases: [] },
  { city: "Thames", country: "New Zealand", aliases: ["thames-coromandel"] },
  { city: "Balikpapan", country: "Indonesia", aliases: [] },
  { city: "Beirut", country: "Lebanon", aliases: [] },
  { city: "Yerevan", country: "Armenia", aliases: [] },
  { city: "Jeonju", country: "South Korea", aliases: [] },
  { city: "Santa Marta", country: "Colombia", aliases: [] },
  { city: "Modena", country: "Italy", aliases: [] },
  { city: "Stellenbosch", country: "South Africa", aliases: [] },
  { city: "Tecámac", country: "Mexico", aliases: ["tecamac"] },
  { city: "Jaraguá do Sul", country: "Brazil", aliases: ["jaragua do sul"] },
  { city: "Drummondville", country: "Canada", aliases: [] },
  { city: "Nunawading", country: "Australia", aliases: [] },
  { city: "Collingwood", country: "Australia", aliases: [] },
];

/**
 * Searches the city database for a query, matching on city name, state, country, or aliases.
 */
export function searchCities(query: string): CityEntry[] {
  if (!query) return [];
  const cleanQuery = query.trim().toLowerCase();
  
  return CITY_DATABASE.filter(entry => {
    const nameMatch = entry.city.toLowerCase().includes(cleanQuery);
    const stateMatch = entry.state?.toLowerCase().includes(cleanQuery) || false;
    const countryMatch = entry.country.toLowerCase().includes(cleanQuery);
    const aliasMatch = entry.aliases?.some(alias => alias.toLowerCase().includes(cleanQuery)) || false;
    
    return nameMatch || stateMatch || countryMatch || aliasMatch;
  });
}

export function standardizeCityName(name: string): string {
  if (!name) return name;
  
  // 1. Clean basic string
  let cleanName = name.trim().toLowerCase();
  
  // 2. If it contains comma or parentheses, take the first part
  if (cleanName.includes(',')) {
    cleanName = cleanName.split(',')[0].trim();
  }
  if (cleanName.includes('(')) {
    cleanName = cleanName.split('(')[0].trim();
  }
  
  // 3. Direct check against standard cities and their aliases
  for (const entry of CITY_DATABASE) {
    if (entry.city.toLowerCase() === cleanName) {
      return entry.city;
    }
    if (entry.aliases?.some(alias => alias.toLowerCase() === cleanName)) {
      return entry.city;
    }
  }
  
  // 4. Specific fallbacks for spelling mistakes/legacy fields
  if (["bengaluru", "bangalore", "benguluru", "banglore", "blr", "bengalore"].includes(cleanName)) {
    return "Bengaluru";
  }
  if (["delhi ncr", "new delhi", "ncr", "delhi", "delhi-ncr"].includes(cleanName)) {
    return "Delhi";
  }
  if (["gurgaon", "gurugram"].includes(cleanName)) {
    return "Gurugram";
  }
  if (["noida", "greater noida"].includes(cleanName)) {
    return "Noida";
  }
  if (["mumbai", "bombay"].includes(cleanName)) {
    return "Mumbai";
  }
  if (["pune"].includes(cleanName)) {
    return "Pune";
  }
  if (["hyderabad"].includes(cleanName)) {
    return "Hyderabad";
  }
  if (["chennai", "madras"].includes(cleanName)) {
    return "Chennai";
  }
  if (["kolkata", "calcutta"].includes(cleanName)) {
    return "Kolkata";
  }
  if (["ahmedabad"].includes(cleanName)) {
    return "Ahmedabad";
  }
  if (["visakhapatnam", "vizag", "vishakapatnam"].includes(cleanName)) {
    return "Visakhapatnam";
  }
  
  // 5. State-to-major-city mappings for fallback (if state name was inputted as city)
  if (["karnataka"].includes(cleanName)) {
    return "Bengaluru";
  }
  if (["maharashtra"].includes(cleanName)) {
    return "Mumbai";
  }
  if (["gujarat", "gujrat"].includes(cleanName)) {
    return "Ahmedabad";
  }
  if (["tamilnadu", "tamil nadu"].includes(cleanName)) {
    return "Chennai";
  }
  if (["uttar pradesh", "uttarpradesh"].includes(cleanName)) {
    return "Noida";
  }

  // 6. Title case capitalization fallback if not matched
  const words = name.trim().split(/[\s,]+/);
  return words
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

