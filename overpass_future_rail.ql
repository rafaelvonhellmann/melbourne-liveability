[out:json][timeout:90];
// Greater Melbourne bbox: south,west,north,east
(
  // --- Under-construction / proposed railway lines (heavy rail, metro, light rail/tram) ---
  way["railway"="construction"](-38.4,144.3,-37.4,145.5);
  way["railway"="proposed"](-38.4,144.3,-37.4,145.5);
  way["construction:railway"](-38.4,144.3,-37.4,145.5);
  way["proposed:railway"](-38.4,144.3,-37.4,145.5);
  relation["railway"="construction"](-38.4,144.3,-37.4,145.5);
  relation["railway"="proposed"](-38.4,144.3,-37.4,145.5);

  // --- Under-construction / proposed STATIONS and stops (nodes + ways) ---
  nwr["railway"="construction"]["construction"="station"](-38.4,144.3,-37.4,145.5);
  nwr["construction"="station"](-38.4,144.3,-37.4,145.5);
  nwr["railway"="proposed"]["proposed"="station"](-38.4,144.3,-37.4,145.5);
  nwr["proposed"="station"](-38.4,144.3,-37.4,145.5);
  nwr["construction"="halt"](-38.4,144.3,-37.4,145.5);
  nwr["proposed"="halt"](-38.4,144.3,-37.4,145.5);
  nwr["construction"="tram_stop"](-38.4,144.3,-37.4,145.5);
  nwr["proposed"="tram_stop"](-38.4,144.3,-37.4,145.5);

  // --- Sites/relations grouping a future station (e.g. Metro Tunnel station complexes) ---
  relation["construction"="station"](-38.4,144.3,-37.4,145.5);
  relation["proposed"="station"](-38.4,144.3,-37.4,145.5);
);
out tags center;
