# Local v8 coverage (plugins-p share), main 58b649460

| package                   | lines                | statements           | branches           | functions          | tests                |
| ------------------------- | -------------------- | -------------------- | ------------------ | ------------------ | -------------------- |
| @conciv/app               | 56.77% (1090/1920)   | 54.71% (1335/2440)   | 59.87% (1097/1832) | 49.25% (330/670)   | Tests 14 failed      | 516 passed (561) |
| @conciv/cli               | 89.25% (1204/1349)   | 86.36% (1412/1635)   | 79.38% (724/912)   | 82.62% (447/541)   | Tests 9 failed       | 353 passed (362) |
| @conciv/core              | 92.87% (2620/2821)   | 91.04% (3079/3382)   | 83.92% (1368/1630) | 92.5% (1160/1254)  | Tests 14 failed      | 349 passed       | 1 skipped (364) |
| @conciv/db                | 91.45% (182/199)     | 89.03% (203/228)     | 77.33% (58/75)     | 90.24% (74/82)     | Tests 1 failed       | 29 passed (30)   |
| @conciv/embed             | 17.24% (10/58)       | 17.14% (12/70)       | 19.23% (5/26)      | 17.64% (3/17)      | Tests 29 passed (29) |
| @conciv/preact            | Unknown% (0/0)       | Unknown% (0/0)       | Unknown% (0/0)     | Unknown% (0/0)     | Tests 3 passed (3)   |
| @conciv/react             | Unknown% (0/0)       | Unknown% (0/0)       | Unknown% (0/0)     | Unknown% (0/0)     | Tests 3 passed (3)   |
| @conciv/solid             | Unknown% (0/0)       | Unknown% (0/0)       | Unknown% (0/0)     | Unknown% (0/0)     | Tests 3 passed (3)   |
| @conciv/ui-kit-chat       | 82.46% (4650/5639)   | 78.79% (6002/7617)   | 66.33% (2047/3086) | 74.97% (2597/3464) | Tests 2 failed       | 220 passed (222) |
| @conciv/ui-kit-chat-tools | 84.39% (438/519)     | 76.36% (575/753)     | 57.8% (163/282)    | 72.29% (287/397)   | Tests 1 failed       | 41 passed (42)   |
| **total**                 | 81.52% (10194/12505) | 78.25% (12618/16125) | 69.64% (5462/7843) | 76.23% (4898/6425) |                      |

local, serial, VITEST_MAX_FORKS=1, reportOnFailure=true; embed = vitest only (its playwright suite not instrumented); app = unit+browser projects
