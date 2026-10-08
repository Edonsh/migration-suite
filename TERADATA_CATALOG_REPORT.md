# 📋 Teradata Migration Suite — Database Catalog Report

> **Database Name:** `demo_user`  
> **Teradata Host:** `gmigrate-8cyv823lqqs4itwo.env.trial.teradata.com`  
> **Connected User:** `demo_user`  
> **Teradata Engine Version:** `20.00.24.60` (ClearScape Analytics)  
> **Report Generation Date:** 2026-10-05  

---

## 📌 Executive Summary

This document provides an inventory and schema audit of all database assets created and managed within the Teradata system, prepared for migration and analysis into Databricks Delta Lake.

| Object Type | Count | Teradata Role | Databricks Target Architecture |
|---|---|---|---|
| **Base Tables** | **5** | Primary transactional & dimension storage | Delta Lake Bronze / Silver Managed Tables |
| **SQL Views** | **3** | Business reporting & aggregation layers | Databricks SQL Views (`CREATE VIEW`) |
| **Stored Procedures** | **4** | Procedural business operations & updates | Databricks SQL Procedures / PySpark Workflows |

---

## 1. 📊 Base Tables (Physical Migration Target)

Base tables are selected for automated parquet extraction, staging to Databricks Volumes, and idempotent loading via `COPY INTO`.

### 1.1 Table: `customers`
- **Row Count:** `20` rows
- **Column Count:** `10` columns
- **Target Delta Table:** `migration_db.source_data.customers`
- **Storage Format:** Parquet (Snappy Compressed) ➔ Delta Lake

**Column Schema & Databricks Mapping:**

| # | Column Name | Teradata Type | Databricks Delta Type | Nullable | Compatibility |
|---|---|---|---|---|---|
| 1 | `customer_id` | `INTEGER` | `BIGINT` | NO | `HIGH (100%)` |
| 2 | `first_name` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |
| 3 | `last_name` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |
| 4 | `email` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |
| 5 | `phone` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |
| 6 | `city` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |
| 7 | `state` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |
| 8 | `country` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |
| 9 | `signup_date` | `DATE` | `DATE` | NO | `HIGH (100%)` |
| 10 | `loyalty_tier` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |

**Sample Records (Top 3 Rows):**

| `customer_id` | `first_name` | `last_name` | `email` | `phone` | `city` | `state` | `country` | `signup_date` | `loyalty_tier` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 19 | Sarah | Connor | sarah.c@example.com | 555-0119 | Denver | CO | USA | 2024-02-14 | Gold |
| 5 | Evan | Wright | evan.w@example.com | 555-0105 | Phoenix | AZ | USA | 2023-05-18 | Bronze |
| 17 | Quinn | Fabray | quinn.f@example.com | 555-0117 | San Francisco | CA | USA | 2024-01-08 | Platinum |


### 1.2 Table: `categories`
- **Row Count:** `15` rows
- **Column Count:** `5` columns
- **Target Delta Table:** `migration_db.source_data.categories`
- **Storage Format:** Parquet (Snappy Compressed) ➔ Delta Lake

**Column Schema & Databricks Mapping:**

| # | Column Name | Teradata Type | Databricks Delta Type | Nullable | Compatibility |
|---|---|---|---|---|---|
| 1 | `category_id` | `INTEGER` | `BIGINT` | NO | `HIGH (100%)` |
| 2 | `category_name` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |
| 3 | `department` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |
| 4 | `description` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |
| 5 | `is_active` | `BYTEINT` | `BIGINT` | NO | `HIGH (100%)` |

**Sample Records (Top 3 Rows):**

| `category_id` | `category_name` | `department` | `description` | `is_active` |
| --- | --- | --- | --- | --- |
| 13 | Outdoor & Camping | Sports | Tents, sleeping bags, and hiking gear | 1 |
| 7 | Kitchen Appliances | Home & Living | Blenders, coffee makers, and air fryers | 1 |
| 5 | Living Room Furniture | Home & Living | Sofas, coffee tables, and entertainment centers | 1 |


### 1.3 Table: `products`
- **Row Count:** `20` rows
- **Column Count:** `8` columns
- **Target Delta Table:** `migration_db.source_data.products`
- **Storage Format:** Parquet (Snappy Compressed) ➔ Delta Lake

**Column Schema & Databricks Mapping:**

| # | Column Name | Teradata Type | Databricks Delta Type | Nullable | Compatibility |
|---|---|---|---|---|---|
| 1 | `product_id` | `INTEGER` | `BIGINT` | NO | `HIGH (100%)` |
| 2 | `category_id` | `INTEGER` | `BIGINT` | NO | `HIGH (100%)` |
| 3 | `product_name` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |
| 4 | `sku` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |
| 5 | `unit_price` | `DECIMAL` | `DECIMAL(38,18)` | NO | `HIGH (100%)` |
| 6 | `cost_price` | `DECIMAL` | `DECIMAL(38,18)` | NO | `HIGH (100%)` |
| 7 | `stock_quantity` | `INTEGER` | `BIGINT` | NO | `HIGH (100%)` |
| 8 | `created_at` | `TIMESTAMP` | `TIMESTAMP` | NO | `HIGH (100%)` |

**Sample Records (Top 3 Rows):**

| `product_id` | `category_id` | `product_name` | `sku` | `unit_price` | `cost_price` | `stock_quantity` | `created_at` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 116 | 11 | AeroStride Runner Shoes | FASH-SHS-016 | 129.50 | 52.00 | 85 | 2026-10-05 20:12:51 |
| 120 | 15 | Mastering Cloud Architectures | BOOK-TEC-020 | 44.95 | 15.00 | 120 | 2026-10-05 20:12:51 |
| 114 | 9 | Classic Oxford Cotton Shirt | FASH-MEN-014 | 49.99 | 18.00 | 200 | 2026-10-05 20:12:51 |


### 1.4 Table: `orders`
- **Row Count:** `20` rows
- **Column Count:** `7` columns
- **Target Delta Table:** `migration_db.source_data.orders`
- **Storage Format:** Parquet (Snappy Compressed) ➔ Delta Lake

**Column Schema & Databricks Mapping:**

| # | Column Name | Teradata Type | Databricks Delta Type | Nullable | Compatibility |
|---|---|---|---|---|---|
| 1 | `order_id` | `INTEGER` | `BIGINT` | NO | `HIGH (100%)` |
| 2 | `customer_id` | `INTEGER` | `BIGINT` | NO | `HIGH (100%)` |
| 3 | `order_date` | `DATE` | `DATE` | NO | `HIGH (100%)` |
| 4 | `status` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |
| 5 | `total_amount` | `DECIMAL` | `DECIMAL(38,18)` | NO | `HIGH (100%)` |
| 6 | `shipping_fee` | `DECIMAL` | `DECIMAL(38,18)` | NO | `HIGH (100%)` |
| 7 | `payment_method` | `VARCHAR` | `STRING` | NO | `HIGH (100%)` |

**Sample Records (Top 3 Rows):**

| `order_id` | `customer_id` | `order_date` | `status` | `total_amount` | `shipping_fee` | `payment_method` |
| --- | --- | --- | --- | --- | --- | --- |
| 1014 | 14 | 2024-03-02 | Processing | 219.00 | 15.00 | Credit Card |
| 1012 | 12 | 2024-02-27 | Shipped | 449.00 | 30.00 | Credit Card |
| 1002 | 2 | 2024-02-03 | Delivered | 249.99 | 0.00 | PayPal |


### 1.5 Table: `order_items`
- **Row Count:** `20` rows
- **Column Count:** `6` columns
- **Target Delta Table:** `migration_db.source_data.order_items`
- **Storage Format:** Parquet (Snappy Compressed) ➔ Delta Lake

**Column Schema & Databricks Mapping:**

| # | Column Name | Teradata Type | Databricks Delta Type | Nullable | Compatibility |
|---|---|---|---|---|---|
| 1 | `item_id` | `INTEGER` | `BIGINT` | NO | `HIGH (100%)` |
| 2 | `order_id` | `INTEGER` | `BIGINT` | NO | `HIGH (100%)` |
| 3 | `product_id` | `INTEGER` | `BIGINT` | NO | `HIGH (100%)` |
| 4 | `quantity` | `INTEGER` | `BIGINT` | NO | `HIGH (100%)` |
| 5 | `unit_price` | `DECIMAL` | `DECIMAL(38,18)` | NO | `HIGH (100%)` |
| 6 | `discount_amount` | `DECIMAL` | `DECIMAL(38,18)` | NO | `HIGH (100%)` |

**Sample Records (Top 3 Rows):**

| `item_id` | `order_id` | `product_id` | `quantity` | `unit_price` | `discount_amount` |
| --- | --- | --- | --- | --- | --- |
| 5014 | 1010 | 107 | 1 | 199.99 | 0.00 |
| 5004 | 1003 | 112 | 1 | 599.00 | 0.00 |
| 5012 | 1009 | 107 | 1 | 199.99 | 0.00 |


---

## 2. 👁️ SQL Views (View-Only Schema Analysis)

Views are virtual datasets compiled from underlying base tables. They are viewable in the **Analyze** page for schema mapping and query translation.

### 2.1 View: `v_customer_order_summary`
- **Output Columns:** `8`
- **Target Equivalent:** `CREATE OR REPLACE VIEW migration_db.source_data.v_customer_order_summary`

**Output Columns:**

| # | Output Column Name | Source Expression / Origin |
|---|---|---|
| 1 | `customer_id` | Computed in view projection |
| 2 | `customer_name` | Computed in view projection |
| 3 | `loyalty_tier` | Computed in view projection |
| 4 | `city` | Computed in view projection |
| 5 | `state` | Computed in view projection |
| 6 | `total_orders` | Computed in view projection |
| 7 | `lifetime_value` | Computed in view projection |
| 8 | `avg_order_value` | Computed in view projection |

**Teradata SQL Definition (`SHOW VIEW`):**
```sql
CREATE VIEW v_customer_order_summary AS
SELECT
c.customer_id,
c.first_name || ' ' || c.last_name AS customer_name,
c.loyalty_tier,
c.city,
c.state,
COUNT(o.order_id) AS total_orders,
COALESCE(SUM(o.total_amount), 0.00) AS lifetime_value,
COALESCE(AVG(o.total_amount), 0.00) AS avg_order_value
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_id, c.first_name, c.last_name, c.loyalty_tier, c.city, c.state;
```

**Live Output Sample (Top 3 Rows):**

| `customer_id` | `customer_name` | `loyalty_tier` | `city` | `state` | `total_orders` | `lifetime_value` | `avg_order_value` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 12 | Laura Croft | Gold | Jacksonville | FL | 1 | 449.00 | 449.0 |
| 6 | Fiona Gallagher | Silver | Philadelphia | PA | 1 | 338.99 | 338.99 |
| 5 | Evan Wright | Bronze | Phoenix | AZ | 1 | 119.99 | 119.99 |


### 2.2 View: `v_product_sales_performance`
- **Output Columns:** `7`
- **Target Equivalent:** `CREATE OR REPLACE VIEW migration_db.source_data.v_product_sales_performance`

**Output Columns:**

| # | Output Column Name | Source Expression / Origin |
|---|---|---|
| 1 | `product_id` | Computed in view projection |
| 2 | `product_name` | Computed in view projection |
| 3 | `category_name` | Computed in view projection |
| 4 | `unit_price` | Computed in view projection |
| 5 | `stock_quantity` | Computed in view projection |
| 6 | `total_units_sold` | Computed in view projection |
| 7 | `total_revenue` | Computed in view projection |

**Teradata SQL Definition (`SHOW VIEW`):**
```sql
CREATE VIEW v_product_sales_performance AS
SELECT
p.product_id,
p.product_name,
cat.category_name,
p.unit_price,
p.stock_quantity,
COALESCE(SUM(oi.quantity), 0) AS total_units_sold,
COALESCE(SUM(oi.quantity * oi.unit_price - oi.discount_amount), 0.00) AS total_revenue
FROM products p
JOIN categories cat ON p.category_id = cat.category_id
LEFT JOIN order_items oi ON p.product_id = oi.product_id
GROUP BY p.product_id, p.product_name, cat.category_name, p.unit_price, p.stock_quantity;
```

**Live Output Sample (Top 3 Rows):**

| `product_id` | `product_name` | `category_name` | `unit_price` | `stock_quantity` | `total_units_sold` | `total_revenue` |
| --- | --- | --- | --- | --- | --- | --- |
| 112 | BaristaTouch Espresso Maker | Kitchen Appliances | 599.00 | 20 | 1 | 599.00 |
| 105 | SonicQuiet Wireless ANC | Audio & Headphones | 249.99 | 110 | 1 | 249.99 |
| 115 | All-Weather Trench Coat | Women Apparel | 159.00 | 60 | 1 | 159.00 |


### 2.3 View: `v_daily_sales_metrics`
- **Output Columns:** `5`
- **Target Equivalent:** `CREATE OR REPLACE VIEW migration_db.source_data.v_daily_sales_metrics`

**Output Columns:**

| # | Output Column Name | Source Expression / Origin |
|---|---|---|
| 1 | `order_date` | Computed in view projection |
| 2 | `order_count` | Computed in view projection |
| 3 | `gross_sales` | Computed in view projection |
| 4 | `total_shipping` | Computed in view projection |
| 5 | `avg_ticket_size` | Computed in view projection |

**Teradata SQL Definition (`SHOW VIEW`):**
```sql
CREATE VIEW v_daily_sales_metrics AS
SELECT
order_date,
COUNT(order_id) AS order_count,
SUM(total_amount) AS gross_sales,
SUM(shipping_fee) AS total_shipping,
AVG(total_amount) AS avg_ticket_size
FROM orders
WHERE status <> 'Cancelled'
GROUP BY order_date;
```

**Live Output Sample (Top 3 Rows):**

| `order_date` | `order_count` | `gross_sales` | `total_shipping` | `avg_ticket_size` |
| --- | --- | --- | --- | --- |
| 2024-03-08 | 1 | 289.00 | 20.00 | 289.0 |
| 2024-02-01 | 1 | 1349.98 | 15.00 | 1349.98 |
| 2024-02-25 | 1 | 129.50 | 8.50 | 129.5 |


---

## 3. ⚡ Stored Procedures (View-Only Logic Analysis)

Stored Procedures encapsulate business logic, transactional modifications, and calculations. They are inspected via `SHOW PROCEDURE` and parameter descriptors.

### 3.1 Stored Procedure: `sp_update_loyalty_tier`
- **Parameter Count:** `3`
- **Language / Flavor:** Teradata Stored Procedure Language (SPL)
- **Execution Type:** Callable database routine

**Parameter Signatures:**

| Parameter Name | Mode | Teradata Type | Databricks Equivalent |
|---|---|---|---|
| `in_customer_id` | **`IN`** | `INTEGER` | `BIGINT` |
| `in_tier` | **`IN`** | `VARCHAR` | `STRING` |
| `out_status` | **`OUT`** | `VARCHAR` | `STRING` |

**Teradata SPL Source Code (`SHOW PROCEDURE`):**
```sql
REPLACE PROCEDURE
sp_update_loyalty_tier
(
IN in_customer_id INTEGER,
IN in_tier VARCHAR(20),
OUT out_status VARCHAR(50)
)
BEGIN
UPDATE customers
SET loyalty_tier = in_tier
WHERE customer_id = in_customer_id;
SET out_status = 'LOYALTY TIER UPDATED';
END;
```

**Databricks Migration Recommendation:**

- **Option A (SQL Scripting):** Implement as a Databricks SQL Stored Procedure (`CREATE OR REPLACE PROCEDURE sp_update_loyalty_tier(...) LANGUAGE SQL BEGIN ... END;`).
- **Option B (Python/PySpark):** Package the procedural operations into a PySpark task in Databricks Workflows or a Databricks Notebook.


### 3.2 Stored Procedure: `sp_update_stock`
- **Parameter Count:** `3`
- **Language / Flavor:** Teradata Stored Procedure Language (SPL)
- **Execution Type:** Callable database routine

**Parameter Signatures:**

| Parameter Name | Mode | Teradata Type | Databricks Equivalent |
|---|---|---|---|
| `in_product_id` | **`IN`** | `INTEGER` | `BIGINT` |
| `in_quantity` | **`IN`** | `INTEGER` | `BIGINT` |
| `out_new_stock` | **`OUT`** | `INTEGER` | `BIGINT` |

**Teradata SPL Source Code (`SHOW PROCEDURE`):**
```sql
REPLACE PROCEDURE
sp_update_stock
(
IN in_product_id INTEGER,
IN in_quantity INTEGER,
OUT out_new_stock INTEGER
)
BEGIN
UPDATE products
SET stock_quantity = stock_quantity + in_quantity
WHERE product_id = in_product_id;
SELECT stock_quantity INTO out_new_stock
FROM products
WHERE product_id = in_product_id;
END;
```

**Databricks Migration Recommendation:**

- **Option A (SQL Scripting):** Implement as a Databricks SQL Stored Procedure (`CREATE OR REPLACE PROCEDURE sp_update_stock(...) LANGUAGE SQL BEGIN ... END;`).
- **Option B (Python/PySpark):** Package the procedural operations into a PySpark task in Databricks Workflows or a Databricks Notebook.


### 3.3 Stored Procedure: `sp_apply_order_discount`
- **Parameter Count:** `3`
- **Language / Flavor:** Teradata Stored Procedure Language (SPL)
- **Execution Type:** Callable database routine

**Parameter Signatures:**

| Parameter Name | Mode | Teradata Type | Databricks Equivalent |
|---|---|---|---|
| `in_order_id` | **`IN`** | `INTEGER` | `BIGINT` |
| `in_discount_rate` | **`IN`** | `DECIMAL` | `DECIMAL(38,18)` |
| `out_new_total` | **`OUT`** | `DECIMAL` | `DECIMAL(38,18)` |

**Teradata SPL Source Code (`SHOW PROCEDURE`):**
```sql
REPLACE PROCEDURE
sp_apply_order_discount
(
IN in_order_id INTEGER,
IN in_discount_rate DECIMAL(4, 2),
OUT out_new_total DECIMAL(12, 2)
)
BEGIN
UPDATE orders
SET total_amount = total_amount * (1.00 - in_discount_rate)
WHERE order_id = in_order_id;
SELECT total_amount INTO out_new_total
FROM orders
WHERE order_id = in_order_id;
END;
```

**Databricks Migration Recommendation:**

- **Option A (SQL Scripting):** Implement as a Databricks SQL Stored Procedure (`CREATE OR REPLACE PROCEDURE sp_apply_order_discount(...) LANGUAGE SQL BEGIN ... END;`).
- **Option B (Python/PySpark):** Package the procedural operations into a PySpark task in Databricks Workflows or a Databricks Notebook.


### 3.4 Stored Procedure: `sp_get_customer_metrics`
- **Parameter Count:** `3`
- **Language / Flavor:** Teradata Stored Procedure Language (SPL)
- **Execution Type:** Callable database routine

**Parameter Signatures:**

| Parameter Name | Mode | Teradata Type | Databricks Equivalent |
|---|---|---|---|
| `in_customer_id` | **`IN`** | `INTEGER` | `BIGINT` |
| `out_order_count` | **`OUT`** | `INTEGER` | `BIGINT` |
| `out_total_spent` | **`OUT`** | `DECIMAL` | `DECIMAL(38,18)` |

**Teradata SPL Source Code (`SHOW PROCEDURE`):**
```sql
REPLACE PROCEDURE
sp_get_customer_metrics
(
IN in_customer_id INTEGER,
OUT out_order_count INTEGER,
OUT out_total_spent DECIMAL(12, 2)
)
BEGIN
SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(total_amount), 0.00)
INTO out_order_count, out_total_spent
FROM orders
WHERE customer_id = in_customer_id;
END;
```

**Databricks Migration Recommendation:**

- **Option A (SQL Scripting):** Implement as a Databricks SQL Stored Procedure (`CREATE OR REPLACE PROCEDURE sp_get_customer_metrics(...) LANGUAGE SQL BEGIN ... END;`).
- **Option B (Python/PySpark):** Package the procedural operations into a PySpark task in Databricks Workflows or a Databricks Notebook.

