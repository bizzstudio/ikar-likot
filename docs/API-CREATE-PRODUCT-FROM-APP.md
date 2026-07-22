# API: יצירת מוצר מהאפליקציה (עדכון סחורה)

כאשר בסריקת ברקוד ב"קליטת סחורה" המוצר לא נמצא, המשתמש יכול להוסיף מוצר חדש. האפליקציה קוראת ל־API הבא.

## Endpoint

```
POST /app/products
Authorization: Bearer <token>
Content-Type: application/json
```

## Body (JSON)

| שדה | סוג | חובה | תיאור |
|-----|-----|------|--------|
| `barcode` | string | כן | ברקוד המוצר |
| `title` | object | כן | `{ he: string, en: string }` – כותרת עברית ואנגלית |
| `image` | string | לא | קישור לתמונת מוצר (URL) |
| `supplier` | string | לא | ספק |
| `sortCode` | string | לא | קוד מיון |
| `weight` | number | לא | משקל |
| `weightUnit` | string | לא | יחידת משקל (ק"ג, גרם וכו') |
| `kashrut` | string | לא | כשרויות |
| `categories` | string[] | לא | קטגוריות (מערך מחרוזות) |
| `stockQuantity` | number | לא | כמות מלאי התחלתית (ברירת מחדל 0) |
| `expiryDate` | string | לא | תאריך תפוגה (YYYY-MM-DD) |
| `minStockAlert` | number | לא | מינימום מלאי להתראה |
| `salePrice` | number | לא | מחיר מכירה |
| `purchasePrice` | number | לא | מחיר קניה (מחסן) |

## Response מצופה

- **200**: מוצר נוצר. Body יכיל את אובייקט המוצר (כולל `_id` / `id`) כדי שהאפליקציה תעבור אוטומטית למסך "הוסף כמות למלאי".
- **4xx/5xx**: שגיאה. הודעת שגיאה ב־`response.data.message.he` או `response.data.message.en`.

המוצר שנוצר אמור להופיע ברשימת המוצרים במערכת האדמין.
