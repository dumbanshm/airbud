"""IATA airline designators → names. Used to tell real flight numbers ("6E 556") from noise
("A4 paper", "T2"). Codes not listed here are still accepted when the text labels them as a
flight ("Flight XY 123"), so a missing airline degrades gracefully. Add yours if it's missing.
"""

AIRLINE_CODES = {
    # India
    "6E": "IndiGo", "AI": "Air India", "IX": "Air India Express", "UK": "Vistara", "SG": "SpiceJet",
    "QP": "Akasa Air", "I5": "AIX Connect", "9I": "Alliance Air", "S5": "Star Air", "IC": "Fly91",
    "2T": "TruJet", "G8": "Go First", "9W": "Jet Airways", "LB": "Air Costa",
    # Middle East
    "EK": "Emirates", "EY": "Etihad", "QR": "Qatar Airways", "FZ": "flydubai", "G9": "Air Arabia",
    "WY": "Oman Air", "GF": "Gulf Air", "SV": "Saudia", "XY": "flynas", "J9": "Jazeera Airways",
    "KU": "Kuwait Airways", "RJ": "Royal Jordanian", "ME": "Middle East Airlines", "LY": "El Al",
    "OV": "SalamAir", "3L": "Air Arabia Abu Dhabi", "F3": "flyadeal", "IR": "Iran Air",
    # Asia-Pacific
    "SQ": "Singapore Airlines", "TR": "Scoot", "MI": "SilkAir", "TG": "Thai Airways", "FD": "Thai AirAsia",
    "WE": "Thai Smile", "PG": "Bangkok Airways", "SL": "Thai Lion Air", "DD": "Nok Air", "VZ": "Thai Vietjet",
    "CX": "Cathay Pacific", "UO": "HK Express", "HX": "Hong Kong Airlines", "NX": "Air Macau",
    "MH": "Malaysia Airlines", "AK": "AirAsia", "D7": "AirAsia X", "OD": "Batik Air Malaysia",
    "QZ": "Indonesia AirAsia", "Z2": "Philippines AirAsia", "GA": "Garuda Indonesia", "JT": "Lion Air",
    "ID": "Batik Air", "QG": "Citilink", "PR": "Philippine Airlines", "5J": "Cebu Pacific",
    "VN": "Vietnam Airlines", "VJ": "VietJet Air", "QH": "Bamboo Airways", "BL": "Pacific Airlines",
    "NH": "ANA", "JL": "Japan Airlines", "MM": "Peach", "GK": "Jetstar Japan", "BC": "Skymark",
    "KE": "Korean Air", "OZ": "Asiana Airlines", "7C": "Jeju Air", "LJ": "Jin Air", "TW": "T'way Air",
    "BX": "Air Busan", "CI": "China Airlines", "BR": "EVA Air", "IT": "Tigerair Taiwan", "JX": "Starlux",
    "CA": "Air China", "MU": "China Eastern", "CZ": "China Southern", "HU": "Hainan Airlines",
    "3U": "Sichuan Airlines", "ZH": "Shenzhen Airlines", "FM": "Shanghai Airlines", "MF": "Xiamen Airlines",
    "9C": "Spring Airlines", "HO": "Juneyao Air",
    "UL": "SriLankan Airlines", "PK": "PIA", "BG": "Biman Bangladesh", "BS": "US-Bangla Airlines",
    "RA": "Nepal Airlines", "KB": "Druk Air", "Q2": "Maldivian", "KC": "Air Astana", "HY": "Uzbekistan Airways",
    "QF": "Qantas", "JQ": "Jetstar", "VA": "Virgin Australia", "ZL": "Rex", "NZ": "Air New Zealand",
    "FJ": "Fiji Airways", "3K": "Jetstar Asia",
    # Europe
    "BA": "British Airways", "VS": "Virgin Atlantic", "U2": "easyJet", "EC": "easyJet Europe",
    "DS": "easyJet Switzerland", "FR": "Ryanair", "RK": "Ryanair UK", "W6": "Wizz Air", "W9": "Wizz Air UK",
    "LS": "Jet2", "BY": "TUI Airways", "LM": "Loganair", "EI": "Aer Lingus", "LH": "Lufthansa",
    "EW": "Eurowings", "DE": "Condor", "X3": "TUIfly", "LX": "SWISS", "OS": "Austrian", "SN": "Brussels Airlines",
    "AF": "Air France", "TO": "Transavia France", "HV": "Transavia", "KL": "KLM", "IB": "Iberia",
    "I2": "Iberia Express", "VY": "Vueling", "UX": "Air Europa", "V7": "Volotea", "NT": "Binter Canarias",
    "TP": "TAP Air Portugal", "AZ": "ITA Airways", "SK": "SAS", "DY": "Norwegian", "D8": "Norwegian",
    "AY": "Finnair", "BT": "airBaltic", "LO": "LOT", "OK": "Czech Airlines", "RO": "TAROM",
    "FB": "Bulgaria Air", "OU": "Croatia Airlines", "JU": "Air Serbia", "A3": "Aegean", "OA": "Olympic Air",
    "TK": "Turkish Airlines", "PC": "Pegasus", "XQ": "SunExpress", "VF": "AJet", "PS": "Ukraine International",
    "SU": "Aeroflot", "S7": "S7 Airlines", "FI": "Icelandair", "OG": "PLAY", "WK": "Edelweiss",
    "EN": "Air Dolomiti", "4U": "Germanwings", "BE": "Flybe", "WF": "Widerøe", "HU ": "Hainan",
    "LG": "Luxair", "KM": "KM Malta Airlines", "CY": "Cyprus Airways", "J2": "Azerbaijan Airlines",
    "A9": "Georgian Airways", "B2": "Belavia",
    # Americas
    "AA": "American Airlines", "DL": "Delta", "UA": "United", "WN": "Southwest", "B6": "JetBlue",
    "AS": "Alaska Airlines", "NK": "Spirit", "F9": "Frontier", "G4": "Allegiant", "SY": "Sun Country",
    "HA": "Hawaiian Airlines", "MX": "Breeze", "AC": "Air Canada", "WS": "WestJet", "TS": "Air Transat",
    "PD": "Porter", "F8": "Flair", "AM": "Aeroméxico", "Y4": "Volaris", "VB": "Viva Aerobus",
    "CM": "Copa Airlines", "AV": "Avianca", "LA": "LATAM", "JJ": "LATAM Brasil", "G3": "GOL",
    "AD": "Azul", "AR": "Aerolíneas Argentinas", "H2": "Sky Airline", "JA": "JetSMART", "4M": "LATAM Argentina",
    "BW": "Caribbean Airlines", "UP": "Bahamasair",
    # Africa
    "ET": "Ethiopian Airlines", "MS": "EgyptAir", "KQ": "Kenya Airways", "SA": "South African Airways",
    "FA": "FlySafair", "AT": "Royal Air Maroc", "WB": "RwandAir", "TU": "Tunisair", "AH": "Air Algérie",
    "MK": "Air Mauritius", "HM": "Air Seychelles", "W3": "Arik Air", "P4": "Air Peace", "TC": "Air Tanzania",
}
AIRLINE_CODES = {k.strip(): v for k, v in AIRLINE_CODES.items()}
