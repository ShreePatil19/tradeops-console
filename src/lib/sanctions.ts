export type SanctionsEntry = {
  name: string;
  aliases: string[];
  list: "OFAC SDN" | "DFAT" | "EU" | "UN";
  reason: string;
  addedAt: string;
};

export const sanctionsList: SanctionsEntry[] = [
  {
    name: "Sovcomflot PJSC",
    aliases: ["Sovcomflot", "SCF Group"],
    list: "OFAC SDN",
    reason: "Operating in the Russian Federation marine sector following 2022 designation.",
    addedAt: "2022-02-22",
  },
  {
    name: "Bank Markazi Iran",
    aliases: ["Central Bank of Iran", "CBI"],
    list: "OFAC SDN",
    reason: "Iran central bank under counter-terrorism authorities.",
    addedAt: "2019-09-20",
  },
  {
    name: "Korea Mining Development Trading Corporation",
    aliases: ["KOMID"],
    list: "UN",
    reason: "DPRK arms trade and proliferation activity.",
    addedAt: "2009-04-24",
  },
  {
    name: "Rosneft Trading SA",
    aliases: ["Rosneft Trading"],
    list: "OFAC SDN",
    reason: "Operating in the energy sector of the Russian Federation.",
    addedAt: "2020-02-18",
  },
  {
    name: "Wagner Group",
    aliases: ["PMC Wagner", "Group Wagner"],
    list: "DFAT",
    reason: "Russia-linked paramilitary entity under Autonomous Sanctions Regulations.",
    addedAt: "2023-03-23",
  },
  {
    name: "Myanma Foreign Trade Bank",
    aliases: ["MFTB"],
    list: "DFAT",
    reason: "Myanmar military-affiliated financial institution.",
    addedAt: "2023-02-01",
  },
  {
    name: "Hizballah",
    aliases: ["Hezbollah", "Party of God"],
    list: "DFAT",
    reason: "Designated terrorist organisation.",
    addedAt: "2021-11-24",
  },
];

export type SanctionsMatch = {
  matched: boolean;
  entries: Array<SanctionsEntry & { matchedOn: string }>;
};

export function checkSanctions(query: string): SanctionsMatch {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { matched: false, entries: [] };
  }
  const hits: Array<SanctionsEntry & { matchedOn: string }> = [];
  for (const entry of sanctionsList) {
    const allNames = [entry.name, ...entry.aliases];
    for (const candidate of allNames) {
      const c = candidate.toLowerCase();
      if (c === q || c.includes(q) || q.includes(c)) {
        hits.push({ ...entry, matchedOn: candidate });
        break;
      }
    }
  }
  return { matched: hits.length > 0, entries: hits };
}
