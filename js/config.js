export const STORAGE_KEY = 'mermaid-studio:v1';
export const GREETING = "I can help you create Mermaid diagrams. Describe what you need — a flowchart, sequence diagram, ER diagram, etc. — and I'll generate the code.";

export const EXAMPLES = [
  { label: "Flowchart", code: `graph LR\n    A[Input] --> B{Decision}\n    B -->|Path 1| C[Process A]\n    B -->|Path 2| D[Process B]\n    C --> E[Output]\n    D --> E` },
  { label: "Sequence", code: `sequenceDiagram\n    participant U as User\n    participant S as Server\n    participant DB as Database\n    U->>S: POST /api/data\n    S->>DB: INSERT query\n    DB-->>S: Success\n    S-->>U: 201 Created` },
  { label: "Class Diagram", code: `classDiagram\n    class Animal {\n        +String name\n        +int age\n        +makeSound()\n    }\n    class Dog {\n        +String breed\n        +fetch()\n    }\n    class Cat {\n        +bool indoor\n        +purr()\n    }\n    Animal <|-- Dog\n    Animal <|-- Cat` },
  { label: "State", code: `stateDiagram-v2\n    [*] --> Idle\n    Idle --> Loading : fetch()\n    Loading --> Success : 200 OK\n    Loading --> Error : 4xx/5xx\n    Success --> Idle : reset\n    Error --> Loading : retry\n    Error --> Idle : cancel` },
  { label: "Gantt", code: `gantt\n    title Project Timeline\n    dateFormat YYYY-MM-DD\n    section Design\n        Wireframes     :done, d1, 2025-01-01, 7d\n        Mockups        :active, d2, after d1, 5d\n    section Development\n        Frontend       :d3, after d2, 10d\n        Backend        :d4, after d2, 12d\n    section Testing\n        QA             :d5, after d4, 5d` },
  { label: "Sankey", code: `sankey-beta\n\nsource,target,value\nSalary,Rent,1200\nSalary,Food,500\nSalary,Savings,800\nSalary,Other,300\nFood,Groceries,350\nFood,Dining,150` },
  { label: "Architecture", code: `architecture-beta\n    group api(cloud)[API]\n\n    service db(database)[Database] in api\n    service disk1(disk)[Storage] in api\n    service disk2(disk)[Backup] in api\n    service server(server)[Server] in api\n\n    db:L -- R:server\n    disk1:T -- B:server\n    disk2:T -- B:db` },
  { label: "Radar", code: `radar-beta\n    title "Skills Comparison"\n    axis a["Speed"], b["Strength"], c["Magic"], d["Defense"], e["Stamina"]\n    curve p1["Hero"]{85, 70, 60, 80, 75}\n    curve p2["Villain"]{60, 90, 95, 70, 85}\n    max 100\n    min 0` },
  { label: "Tree", code: `graph TD\n    Root[Project] --> Src[src/]\n    Root --> Tests[tests/]\n    Root --> Docs[docs/]\n    Src --> App[app.js]\n    Src --> Lib[lib/]\n    Lib --> Util[util.js]\n    Lib --> Api[api.js]\n    Tests --> T1[app.test.js]\n    Tests --> T2[api.test.js]\n    Docs --> Readme[README.md]` },
  { label: "XY Chart", code: `xychart-beta\n    title "Monthly Revenue"\n    x-axis [Jan, Feb, Mar, Apr, May, Jun]\n    y-axis "Revenue ($)" 4000 --> 11000\n    bar [5000, 6000, 7500, 8200, 9500, 10500]\n    line [5000, 6000, 7500, 8200, 9500, 10500]` },
];

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fmtTs(ts) {
  const d = new Date(ts);
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${mo} ${d.getDate()} ${h}:${m}${ampm}`;
}

export function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
