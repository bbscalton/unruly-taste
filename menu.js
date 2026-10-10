/* Unruly Taste MENU DATA (single source of truth, prices in GYD). Updated 2026-10-08 from the owner's official flyer.
 * Used by: this ordering page (app.js), the POS (pos/) AND the Unruly Taste voice/chat bot, which downloads this file and
 * parses the JSON object below (keep it strict JSON: double quotes, no comments/functions inside).
 * price null = no posted price. opts = name of a list in "lists". img null = no photo yet (a no-photo card is shown; "icon" is its emoji).
 * Item ids are 2 lowercase letters (used in reorder links); option order matters for old reorder links,
 * so ADD new options at the END of a list. "day" (0=Sun..6=Sat) = day-only item: other days are pre-orders (gentle notice). */
window.UT_MENU = {
 "version": 2,
 "updated": "2026-10-08",
 "business": {
  "name": "Unruly Taste",
  "owner": "Johntel",
  "address": "5th Street, Alberttown (between Light & Albert Street), Georgetown, Guyana",
  "pickupAddress": "5th Street, Alberttown (between Light & Albert St), Georgetown",
  "status": "Opening Soon",
  "hours": "Hours coming soon",
  "services": [
   "delivery",
   "takeout",
   "in-store pickup"
  ],
  "instagram": "@unruly_taste",
  "deliveryNote": "Delivery charges apply (confirmed on WhatsApp).",
  "extrasNote": "Refreshers, milkshakes, local juice and sides (corn ribs, mac & cheese balls) can be ordered on their own or added to any meal.",
  "payment": "Pay on pickup or delivery."
 },
 "currency": "G$",
 "lists": {
  "flavours": [
   "BBQ",
   "Honey Glaze",
   "Lemon Pepper",
   "Garlic Parmesan",
   "Thai Chili",
   "Coconut Pineapple"
  ],
  "choice": [
   "Plantain",
   "Potato Fries",
   "Wedges"
  ],
  "plantainWedges": [
   "Plantain",
   "Wedges"
  ],
  "protein": [
   "Wings",
   "Strip chicken"
  ],
  "boxes": [
   "Hot Box",
   "Wrap Box"
  ],
  "burgers": [
   "Chicken",
   "Beef",
   "Fish"
  ],
  "drinkType": [
   "Milkshake",
   "Refresher"
  ],
  "refreshers": [
   "Mango",
   "Blueberry",
   "Pink Lemonade",
   "Dragon Fruit",
   "Strawberry",
   "Tropical Blast",
   "Coconut Pineapple"
  ],
  "milkshakes": [
   "Chocolate",
   "Caramel",
   "Strawberry",
   "Cookies & Cream"
  ]
 },
 "sections": [
  {
   "id": "deals",
   "title": "🔥 Deals"
  },
  {
   "id": "boxes",
   "title": "📦 Unruly Boxes"
  },
  {
   "id": "mains",
   "title": "🍔 Burgers & New"
  },
  {
   "id": "wings",
   "title": "🍗 Wings Specials"
  },
  {
   "id": "fish",
   "title": "🐟 Fish Specials"
  },
  {
   "id": "sides",
   "title": "🌽 Sides"
  },
  {
   "id": "drinks",
   "title": "🥤 Drinks"
  }
 ],
 "items": [
  {
   "id": "db",
   "sec": "deals",
   "name": "Thursday Double Bubble",
   "price": 5000,
   "day": 4,
   "dayName": "Thursday",
   "img": "deal-thursday-double-bubble.webp",
   "icon": "📦",
   "desc": "Any 2 Hot Box or Wrap Box, each with wings or strip chicken, for one price. Perfect for sharing (or not!).",
   "groups": [
    {
     "key": "b1",
     "label": "Box 1",
     "short": "Box 1",
     "opts": "boxes"
    },
    {
     "key": "p1",
     "label": "Box 1 comes with",
     "short": "with",
     "opts": "protein"
    },
    {
     "key": "f1",
     "label": "Box 1 wing sauce",
     "short": "Flavour",
     "opts": "flavours",
     "showIf": [
      "p1",
      0
     ]
    },
    {
     "key": "b2",
     "label": "Box 2",
     "short": "Box 2",
     "opts": "boxes"
    },
    {
     "key": "p2",
     "label": "Box 2 comes with",
     "short": "with",
     "opts": "protein"
    },
    {
     "key": "f2",
     "label": "Box 2 wing sauce",
     "short": "Flavour",
     "opts": "flavours",
     "showIf": [
      "p2",
      0
     ]
    }
   ]
  },
  {
   "id": "mm",
   "sec": "deals",
   "name": "Friday Mega Meal",
   "price": 6000,
   "day": 5,
   "dayName": "Friday",
   "img": "deal-friday-mega-meal.webp",
   "icon": "🥤",
   "desc": "Any 2 Hot Box or Wrap Box + 2 refreshers.",
   "groups": [
    {
     "key": "b1",
     "label": "Box 1",
     "short": "Box 1",
     "opts": "boxes"
    },
    {
     "key": "p1",
     "label": "Box 1 comes with",
     "short": "with",
     "opts": "protein"
    },
    {
     "key": "f1",
     "label": "Box 1 wing sauce",
     "short": "Flavour",
     "opts": "flavours",
     "showIf": [
      "p1",
      0
     ]
    },
    {
     "key": "b2",
     "label": "Box 2",
     "short": "Box 2",
     "opts": "boxes"
    },
    {
     "key": "p2",
     "label": "Box 2 comes with",
     "short": "with",
     "opts": "protein"
    },
    {
     "key": "f2",
     "label": "Box 2 wing sauce",
     "short": "Flavour",
     "opts": "flavours",
     "showIf": [
      "p2",
      0
     ]
    },
    {
     "key": "r1",
     "label": "Refresher 1",
     "short": "Refresher 1",
     "opts": "refreshers"
    },
    {
     "key": "r2",
     "label": "Refresher 2",
     "short": "Refresher 2",
     "opts": "refreshers"
    }
   ]
  },
  {
   "id": "rp",
   "sec": "deals",
   "name": "Rasta Pasta (Friday Special)",
   "price": 2800,
   "day": 5,
   "dayName": "Friday",
   "img": null,
   "icon": "🍝",
   "desc": "NEW. Rich & creamy rasta pasta served with strip chicken or wings. Fridays only.",
   "groups": [
    {
     "key": "p",
     "label": "Served with",
     "short": "with",
     "opts": "protein"
    }
   ]
  },
  {
   "id": "ub",
   "sec": "boxes",
   "name": "Unruly Box",
   "price": 2500,
   "img": null,
   "icon": "📦",
   "desc": "Strip chicken, fries & mac and cheese.",
   "groups": []
  },
  {
   "id": "uw",
   "sec": "boxes",
   "name": "Unruly Box with Wings",
   "price": 2500,
   "img": "wings-combo.webp",
   "icon": "📦",
   "desc": "Wings, fries & mac and cheese.",
   "groups": [
    {
     "key": "f",
     "label": "Choose sauce",
     "short": "Flavour",
     "opts": "flavours"
    }
   ]
  },
  {
   "id": "hb",
   "sec": "boxes",
   "name": "Unruly Hot Box",
   "price": 3000,
   "img": "hot-box.webp",
   "icon": "🍔",
   "desc": "Chicken burger, fries, mac and cheese, with wings or strip chicken.",
   "groups": [
    {
     "key": "p",
     "label": "Comes with",
     "short": "with",
     "opts": "protein"
    },
    {
     "key": "f",
     "label": "Wing sauce",
     "short": "Flavour",
     "opts": "flavours",
     "showIf": [
      "p",
      0
     ]
    }
   ]
  },
  {
   "id": "wb",
   "sec": "boxes",
   "name": "Unruly Wrap Box",
   "price": 3000,
   "img": "wrap-box.webp",
   "icon": "🌯",
   "desc": "Tropical chicken wrap with fries, mac and cheese, with wings or strip chicken.",
   "groups": [
    {
     "key": "p",
     "label": "Comes with",
     "short": "with",
     "opts": "protein"
    },
    {
     "key": "f",
     "label": "Wing sauce",
     "short": "Flavour",
     "opts": "flavours",
     "showIf": [
      "p",
      0
     ]
    }
   ]
  },
  {
   "id": "lq",
   "sec": "mains",
   "name": "Deep Fried Leg Quarters (cut up)",
   "price": 2500,
   "img": null,
   "icon": "🍗",
   "desc": "NEW. Served with your choice of plantain, potato fries or wedges.",
   "groups": [
    {
     "key": "s",
     "label": "Served with",
     "short": "Side",
     "opts": "choice"
    }
   ]
  },
  {
   "id": "bo",
   "sec": "mains",
   "name": "Unruly Bowl",
   "price": 2800,
   "img": null,
   "icon": "🥣",
   "desc": "NEW. Wings or strip chicken, mac & cheese, corn & peppers rice.",
   "groups": [
    {
     "key": "p",
     "label": "Comes with",
     "short": "with",
     "opts": "protein"
    },
    {
     "key": "f",
     "label": "Wing sauce",
     "short": "Flavour",
     "opts": "flavours",
     "showIf": [
      "p",
      0
     ]
    }
   ]
  },
  {
   "id": "bu",
   "sec": "mains",
   "name": "Burger & Fries",
   "price": 2500,
   "img": null,
   "icon": "🍔",
   "desc": "Chicken, beef or fish burger & fries.",
   "groups": [
    {
     "key": "b",
     "label": "Choose burger",
     "short": "Burger",
     "opts": "burgers"
    }
   ]
  },
  {
   "id": "bc",
   "sec": "mains",
   "name": "Burger Combo",
   "price": 3800,
   "img": "burger-wings-combo.webp",
   "icon": "🍔",
   "desc": "Burger, fries, mac & cheese with wings or strip chicken + milkshake or refresher.",
   "groups": [
    {
     "key": "p",
     "label": "Comes with",
     "short": "with",
     "opts": "protein"
    },
    {
     "key": "f",
     "label": "Wing sauce",
     "short": "Flavour",
     "opts": "flavours",
     "showIf": [
      "p",
      0
     ]
    },
    {
     "key": "d",
     "label": "Drink",
     "short": "Drink",
     "opts": "drinkType"
    },
    {
     "key": "ms",
     "label": "Milkshake flavour",
     "short": "Flavour",
     "opts": "milkshakes",
     "showIf": [
      "d",
      0
     ]
    },
    {
     "key": "rf",
     "label": "Refresher flavour",
     "short": "Flavour",
     "opts": "refreshers",
     "showIf": [
      "d",
      1
     ]
    }
   ]
  },
  {
   "id": "wf",
   "sec": "wings",
   "name": "Wings + Fries + Plantain/Wedges",
   "price": 2500,
   "img": "wings-with-side.webp",
   "icon": "🍗",
   "desc": "Wings Special 1: wings and fries, plus plantain or wedges.",
   "groups": [
    {
     "key": "f",
     "label": "Choose sauce",
     "short": "Flavour",
     "opts": "flavours"
    },
    {
     "key": "s",
     "label": "Plantain or wedges",
     "short": "Side",
     "opts": "plantainWedges"
    }
   ]
  },
  {
   "id": "wt",
   "sec": "wings",
   "name": "12pc Wings Only",
   "price": 2500,
   "img": "wings-12pc.webp",
   "icon": "🍗",
   "desc": "Wings Special 2: 12 wings in your choice of in-house sauce.",
   "groups": [
    {
     "key": "f",
     "label": "Choose sauce",
     "short": "Flavour",
     "opts": "flavours"
    }
   ]
  },
  {
   "id": "wc",
   "sec": "wings",
   "name": "Wings + Fries + Mac & Cheese",
   "price": 2500,
   "img": "wings-combo.webp",
   "icon": "🍗",
   "desc": "Wings Special 3: wings, fries and mac & cheese.",
   "groups": [
    {
     "key": "f",
     "label": "Choose sauce",
     "short": "Flavour",
     "opts": "flavours"
    }
   ]
  },
  {
   "id": "wm",
   "sec": "wings",
   "name": "Mac & Cheese with Wings",
   "price": 2500,
   "img": "wings-combo.webp",
   "icon": "🧀",
   "desc": "Wings Special 4: mac & cheese topped with wings.",
   "groups": [
    {
     "key": "f",
     "label": "Choose sauce",
     "short": "Flavour",
     "opts": "flavours"
    }
   ]
  },
  {
   "id": "wa",
   "sec": "wings",
   "name": "Waffles & Wings",
   "price": 2500,
   "img": "waffles-and-wings.webp",
   "icon": "🧇",
   "desc": "Wings Special 5: waffles and wings.",
   "groups": [
    {
     "key": "f",
     "label": "Choose sauce",
     "short": "Flavour",
     "opts": "flavours"
    }
   ]
  },
  {
   "id": "fb",
   "sec": "fish",
   "name": "Deep Fried Banga Fish",
   "price": 2500,
   "img": null,
   "icon": "🐟",
   "desc": "Served with plantain, fries or wedges.",
   "groups": [
    {
     "key": "s",
     "label": "Served with",
     "short": "Side",
     "opts": "choice"
    }
   ]
  },
  {
   "id": "fw",
   "sec": "fish",
   "name": "Tropical Fish Wrap",
   "price": 1800,
   "img": null,
   "icon": "🌯",
   "desc": "Tropical fish wrap.",
   "groups": []
  },
  {
   "id": "fx",
   "sec": "fish",
   "name": "Fish Wrap Box",
   "price": 3000,
   "img": null,
   "icon": "📦",
   "desc": "Fish wrap box.",
   "groups": []
  },
  {
   "id": "fo",
   "sec": "fish",
   "name": "Fish Only (12pc)",
   "price": 2500,
   "img": null,
   "icon": "🐟",
   "desc": "12 pieces of fried fish.",
   "groups": []
  },
  {
   "id": "fg",
   "sec": "fish",
   "name": "Fish Burger & Fries",
   "price": 1800,
   "img": null,
   "icon": "🍔",
   "desc": "Fish burger & fries.",
   "groups": []
  },
  {
   "id": "cr",
   "sec": "sides",
   "name": "Corn Ribs",
   "price": 1500,
   "img": null,
   "icon": "🌽",
   "desc": "Side: a serving of corn ribs. Add to any meal.",
   "groups": []
  },
  {
   "id": "mb",
   "sec": "sides",
   "name": "Mac & Cheese Balls",
   "price": 1500,
   "img": null,
   "icon": "🧀",
   "desc": "Side: a serving of mac & cheese balls. Add to any meal.",
   "groups": []
  },
  {
   "id": "rf",
   "sec": "drinks",
   "name": "Refresher",
   "price": 1000,
   "img": null,
   "icon": "🥤",
   "desc": "Mango, Blueberry, Pink Lemonade, Dragon Fruit, Strawberry, Tropical Blast or Coconut Pineapple.",
   "groups": [
    {
     "key": "f",
     "label": "Choose refresher",
     "short": "Flavour",
     "opts": "refreshers"
    }
   ]
  },
  {
   "id": "mk",
   "sec": "drinks",
   "name": "Milkshake",
   "price": 1700,
   "img": null,
   "icon": "🥛",
   "desc": "Chocolate, Caramel, Strawberry or Cookies & Cream.",
   "groups": [
    {
     "key": "f",
     "label": "Choose milkshake",
     "short": "Flavour",
     "opts": "milkshakes"
    }
   ]
  },
  {
   "id": "lj",
   "sec": "drinks",
   "name": "Local Juice",
   "price": 500,
   "img": null,
   "icon": "🧃",
   "desc": "Local juice.",
   "groups": []
  }
 ]
};
