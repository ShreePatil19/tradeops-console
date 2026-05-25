export type CorpusChunk = {
  id: string;
  title: string;
  source: string;
  text: string;
};

export const corpus: CorpusChunk[] = [
  {
    id: "incoterms-exw",
    title: "Incoterms 2020 — EXW (Ex Works)",
    source: "ICC Incoterms 2020",
    text: "Under EXW the seller delivers when it places the goods at the disposal of the buyer at the seller's premises or at another named place, not cleared for export and not loaded on any collecting vehicle. The buyer bears all costs and risks involved in taking the goods from the seller's premises to the desired destination. EXW represents the minimum obligation for the seller and is generally not recommended for international trade because the buyer has limited ability to carry out export formalities in the seller's country.",
  },
  {
    id: "incoterms-fob",
    title: "Incoterms 2020 — FOB (Free On Board)",
    source: "ICC Incoterms 2020",
    text: "Under FOB the seller delivers the goods on board the vessel nominated by the buyer at the named port of shipment, or procures the goods already so delivered. The risk of loss of or damage to the goods passes when the goods are on board the vessel, and the buyer bears all costs from that moment onwards. FOB applies only to sea or inland waterway transport. For containerised cargo, FCA (Free Carrier) is generally more appropriate because container handover usually happens at a terminal rather than on the vessel itself.",
  },
  {
    id: "incoterms-cif",
    title: "Incoterms 2020 — CIF (Cost, Insurance and Freight)",
    source: "ICC Incoterms 2020",
    text: "Under CIF the seller delivers the goods on board the vessel and pays the costs and freight necessary to bring the goods to the named port of destination. The seller also contracts for insurance cover against the buyer's risk of loss of or damage to the goods during the carriage. Under CIF 2020 the seller is required to obtain insurance only on minimum cover (Institute Cargo Clauses C) unless the parties agree otherwise. Risk transfers when goods are on board the vessel at the port of shipment, even though the seller arranges main carriage.",
  },
  {
    id: "incoterms-dap",
    title: "Incoterms 2020 — DAP (Delivered at Place)",
    source: "ICC Incoterms 2020",
    text: "Under DAP the seller delivers when the goods are placed at the disposal of the buyer on the arriving means of transport ready for unloading at the named place of destination. The seller bears all risks involved in bringing the goods to the named place. DAP does not include unloading costs at destination or import customs clearance, both of which remain the buyer's responsibility. DAP works for any mode of transport.",
  },
  {
    id: "incoterms-ddp",
    title: "Incoterms 2020 — DDP (Delivered Duty Paid)",
    source: "ICC Incoterms 2020",
    text: "Under DDP the seller delivers the goods when they are placed at the disposal of the buyer, cleared for import, on the arriving means of transport ready for unloading at the named place of destination. The seller bears all the costs and risks involved in bringing the goods to the place of destination and has the obligation to clear the goods not only for export but also for import, to pay any duty for both export and import, and to carry out all customs formalities. DDP represents the maximum obligation for the seller.",
  },
  {
    id: "au-import-gst",
    title: "Australian GST on imports (low value threshold)",
    source: "Australian Taxation Office",
    text: "GST applies to most goods imported into Australia. For consignments with a customs value of AUD 1,000 or less, GST is generally collected by the overseas supplier or electronic distribution platform at the point of sale (the low value imported goods regime). For consignments above AUD 1,000, GST is collected at the border by the Australian Border Force as part of the import declaration process, in addition to any customs duty payable. The GST rate is 10% of the value of the taxable importation, which for high value goods is customs value plus duty plus international transport and insurance.",
  },
  {
    id: "au-tariff-concession",
    title: "Tariff Concession Orders in Australia",
    source: "Australian Border Force",
    text: "A Tariff Concession Order (TCO) is an instrument that provides duty-free entry for imported goods on the basis that there is no Australian industry producing substitutable goods. Importers can apply for a TCO if they believe no such substitutable goods are produced in Australia in the ordinary course of business. Successful TCO applications result in a tariff classification carrying a free rate of duty when claimed at the time of import. TCOs are published on the Tariff Concession System (TCS) and importers must satisfy the description of the TCO at the time of import to be eligible.",
  },
  {
    id: "au-rcep",
    title: "RCEP and rules of origin for Australian imports",
    source: "Department of Foreign Affairs and Trade",
    text: "Under the Regional Comprehensive Economic Partnership (RCEP), goods imported into Australia from another RCEP party may be eligible for preferential tariff treatment if they meet the rules of origin. Originating status can be conferred through a wholly obtained test, a product specific rule (PSR) such as a change in tariff classification or a regional value content threshold, or a de minimis allowance. Proof of origin can take the form of a Certificate of Origin issued by a competent authority or a Declaration of Origin made by an approved exporter. Importers must hold the proof of origin at the time of claiming preferential treatment.",
  },
  {
    id: "au-anti-dumping",
    title: "Anti-dumping and countervailing duties in Australia",
    source: "Anti-Dumping Commission",
    text: "Australian importers may be liable for anti-dumping duty if the imported goods are sold to Australia at a price lower than the normal value in the exporting country and this dumping causes material injury to the Australian industry. Countervailing duties may apply where the goods have been subsidised by a foreign government. The Anti-Dumping Commission investigates and publishes measures by case number and goods description. Importers should check the current Dumping Commodity Register (DCR) at the time of import to determine whether measures apply to their goods, country of origin, and exporter.",
  },
  {
    id: "incoterms-fca",
    title: "Incoterms 2020 — FCA (Free Carrier)",
    source: "ICC Incoterms 2020",
    text: "Under FCA the seller delivers the goods to the carrier or another person nominated by the buyer at the seller's premises or another named place. The seller is required to clear the goods for export. Delivery occurs either at the seller's premises (when loaded on the buyer's means of transport) or at another place (when placed at the disposal of the carrier, not unloaded from the seller's means of transport). FCA 2020 includes an optional on-board notation that allows the seller to instruct the carrier to issue a bill of lading marked on board, which can assist when a letter of credit requires such a notation.",
  },
];
