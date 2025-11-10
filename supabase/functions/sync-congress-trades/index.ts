import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TradeData {
  memberName: string;
  state: string;
  party: string;
  chamber: string;
  ticker: string;
  assetName: string;
  transactionType: "purchase" | "sale";
  transactionDate: string;
  disclosureDate: string;
  amount: string;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseAmountRange(amountStr: string): {
  range: string;
  min: number;
  max: number;
} {
  const ranges: { [key: string]: { min: number; max: number } } = {
    "$1,001 - $15,000": { min: 1001, max: 15000 },
    "$15,001 - $50,000": { min: 15001, max: 50000 },
    "$50,001 - $100,000": { min: 50001, max: 100000 },
    "$100,001 - $250,000": { min: 100001, max: 250000 },
    "$250,001 - $500,000": { min: 250001, max: 500000 },
    "$500,001 - $1,000,000": { min: 500001, max: 1000000 },
    "Over $1,000,000": { min: 1000001, max: 999999999 },
  };

  // Return the parsed range or a default
  const parsed = ranges[amountStr] || { min: 0, max: 0 };
  return {
    range: amountStr,
    min: parsed.min,
    max: parsed.max,
  };
}

async function fetchCongressionalTrades(): Promise<TradeData[]> {
  // This is a placeholder that returns sample data
  // In production, this would scrape from disclosures-clerk.house.gov
  // For now, we demonstrate the structure
  
  try {
    // Attempt to fetch from the House disclosure API endpoint
    const response = await fetch(
      "https://disclosures-clerk.house.gov/FinancialDisclosure/ViewSearch",
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );

    if (!response.ok) {
      console.error("Failed to fetch from House disclosure website");
      return [];
    }

    // Return empty array - actual parsing would happen here
    // This function needs a proper HTML parser or API endpoint
    return [];
  } catch (error) {
    console.error("Error fetching congressional trades:", error);
    return [];
  }
}

async function syncTrades(): Promise<{ membersAdded: number; tradesAdded: number }> {
  let membersAdded = 0;
  let tradesAdded = 0;

  try {
    // Fetch the trades data
    const trades = await fetchCongressionalTrades();

    if (trades.length === 0) {
      console.log("No trades fetched. Returning empty result.");
      return { membersAdded: 0, tradesAdded: 0 };
    }

    // Process each trade
    for (const trade of trades) {
      // First, ensure the member exists
      const { data: existingMember } = await supabase
        .from("congress_members")
        .select("id")
        .eq("full_name", trade.memberName)
        .eq("state", trade.state)
        .maybeSingle();

      let memberId: string;

      if (!existingMember) {
        // Create new member
        const { data: newMember, error: memberError } = await supabase
          .from("congress_members")
          .insert([
            {
              full_name: trade.memberName,
              state: trade.state,
              party: trade.party,
              chamber: trade.chamber,
            },
          ])
          .select("id")
          .single();

        if (memberError) {
          console.error("Error creating member:", memberError);
          continue;
        }
        memberId = newMember.id;
        membersAdded++;
      } else {
        memberId = existingMember.id;
      }

      // Check if trade already exists
      const { data: existingTrade } = await supabase
        .from("trades")
        .select("id")
        .eq("member_id", memberId)
        .eq("ticker", trade.ticker)
        .eq("transaction_date", trade.transactionDate)
        .maybeSingle();

      if (!existingTrade) {
        // Create new trade
        const amountParsed = parseAmountRange(trade.amount);

        const { error: tradeError } = await supabase
          .from("trades")
          .insert([
            {
              member_id: memberId,
              ticker: trade.ticker,
              asset_name: trade.assetName,
              transaction_type: trade.transactionType,
              transaction_date: trade.transactionDate,
              disclosure_date: trade.disclosureDate,
              amount_range: amountParsed.range,
              amount_min: amountParsed.min,
              amount_max: amountParsed.max,
            },
          ]);

        if (tradeError) {
          console.error("Error creating trade:", tradeError);
        } else {
          tradesAdded++;
        }
      }
    }
  } catch (error) {
    console.error("Error during sync:", error);
  }

  return { membersAdded, tradesAdded };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const result = await syncTrades();

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Sync completed",
        timestamp: new Date().toISOString(),
        result,
        instructions:
          "To automate this, call this endpoint daily using an external scheduler (cron-job.org, etc.)",
        endpoint: `${supabaseUrl}/functions/v1/sync-congress-trades`,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Sync error:", errorMessage);

    return new Response(
      JSON.stringify({
        status: "error",
        message: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
