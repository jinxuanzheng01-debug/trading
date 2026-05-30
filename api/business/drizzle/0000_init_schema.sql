CREATE TABLE IF NOT EXISTS "analysis_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ticker" varchar(20) NOT NULL,
	"market" varchar(10) NOT NULL,
	"depth" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"result" text,
	"layer_outputs" text,
	"llm_provider" varchar(50),
	"created_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "backtest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"strategy_name" varchar(100) NOT NULL,
	"strategy_code" text NOT NULL,
	"strategy_type" varchar(20) NOT NULL,
	"config" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"metrics" text,
	"equity_curve" text,
	"trades" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "klines" (
	"stock_id" integer NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"open" numeric(12, 4),
	"high" numeric(12, 4),
	"low" numeric(12, 4),
	"close" numeric(12, 4),
	"volume" bigint,
	"amount" bigint,
	"pre_close" numeric(12, 4),
	"change" numeric(12, 4),
	"change_percent" numeric(8, 4),
	"turnover_rate" numeric(8, 4),
	"data_source" varchar(20) DEFAULT 'yfinance',
	CONSTRAINT "klines_stock_id_timestamp_pk" PRIMARY KEY("stock_id","timestamp")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(30) NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text,
	"link" varchar(500),
	"is_read" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quote_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"price" numeric(12, 4),
	"change" numeric(12, 4),
	"change_percent" numeric(8, 4),
	"volume" bigint,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_quotes" (
	"stock_id" integer PRIMARY KEY NOT NULL,
	"price" numeric(12, 4),
	"change" numeric(12, 4),
	"change_percent" numeric(8, 4),
	"open" numeric(12, 4),
	"high" numeric(12, 4),
	"low" numeric(12, 4),
	"volume" bigint,
	"prev_close" numeric(12, 4),
	"market_cap" bigint,
	"currency" varchar(10) DEFAULT 'USD',
	"turnover_rate" numeric(8, 4),
	"amount" bigint,
	"timestamp" timestamp with time zone NOT NULL,
	"data_date" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"name" varchar(200),
	"name_cn" varchar(100),
	"exchange" varchar(20),
	"market" varchar(20),
	"type" varchar(20) DEFAULT 'stock',
	"sector" varchar(100),
	"industry" varchar(100),
	"listing_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "stocks_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"username" varchar(50) NOT NULL,
	"password" varchar(255) NOT NULL,
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlist_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"stock_id" integer,
	"notes" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "backtest_runs" ADD CONSTRAINT "backtest_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "klines" ADD CONSTRAINT "klines_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quote_snapshots" ADD CONSTRAINT "quote_snapshots_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_quotes" ADD CONSTRAINT "stock_quotes_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_groups" ADD CONSTRAINT "watchlist_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_group_id_watchlist_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."watchlist_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "klines_stock_idx" ON "klines" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "klines_timestamp_idx" ON "klines" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_snapshots_stock_ts_idx" ON "quote_snapshots" USING btree ("stock_id","timestamp");