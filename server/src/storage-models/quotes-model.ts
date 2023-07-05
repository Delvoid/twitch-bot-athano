import { FileManager } from '../fileManager';
import { hasOwnProperty } from '../utils/hasOwnProperty';
import { timestampProperties, timestampPropertyTypes, type Timestamp } from './timestamp-model';

export interface Quote extends Timestamp {
  quoteText: string;
  quoteId: string;
  category: string;
  deleted: boolean;
  author: string;
}

const quoteProperties = ['quoteText', 'quoteId', 'category', 'deleted', 'author'] as const;

type QuoteProperties = typeof quoteProperties[number];

const propertyTypes: Record<QuoteProperties, string> & typeof timestampPropertyTypes = {
  quoteText: 'string',
  quoteId: 'string',
  category: 'string',
  deleted: 'boolean',
  author: 'string',
  ...timestampPropertyTypes,
};

const fileName = 'quotes.json';

const quoteValidator = (data: unknown): data is Quote[] => {
  if (Array.isArray(data)) {
    return data.every((quote: unknown) => {
      if (typeof quote !== 'object') {
        return false;
      }

      for (const property of [...quoteProperties, ...timestampProperties]) {
        if (hasOwnProperty(quote, property)) {
          if (typeof quote[property] !== propertyTypes[property]) {
            console.log(`Error: Invalid quote format, property ${property} is not of type ${propertyTypes[property]}`);
            return false;
          }
        } else {
          console.log(`Error: Invalid quote format, missing property ${property}`);
          return false;
        }
      }

      return true;
    });
  }
  return false;
};

export class QuoteModel {
  private static instance: QuoteModel;

  private fileManager: FileManager<Quote[]>;
  private quotes: Quote[] = [];
  constructor() {
    this.fileManager = new FileManager(fileName, quoteValidator);
    this.quotes = this.fileManager.loadData();
  }

  public static getInstance(): QuoteModel {
    if (!QuoteModel.instance) {
      QuoteModel.instance = new QuoteModel();
    }
    return QuoteModel.instance;
  }

  get data(): Quote[] {
    return this.quotes;
  }

  public findOneByQuoteId(quoteId: string): Quote | null {
    const quote = this.quotes.find((quote) => quote.quoteId === quoteId);
    if (!quote || quote.deleted) {
      return null;
    }
    return quote;
  }

  public saveOne(quote: Quote): void {
    const index = this.quotes.findIndex((u) => u.quoteId === quote.quoteId);
    if (index === -1) {
      this.quotes.push(quote);
    } else {
      this.quotes[index] = quote;
    }
    this.fileManager.saveData(this.quotes);
  }

  public deleteOne(quote: Quote): void {
    const index = this.quotes.findIndex((u) => u.quoteId === quote.quoteId);
    if (index !== -1) {
      const isoString = new Date().toISOString();
      this.quotes[index].deleted = true;
      this.quotes[index].updatedAt = isoString;
      this.fileManager.saveData(this.quotes);
    } else {
      console.log(`Error deleting: quote ${quote.quoteId} not found`);
    }
  }

  public nextId(): string {
    let maxId = 0;
    for (const quote of this.quotes) {
      const quoteId = Number(quote.quoteId);
      if (quoteId > maxId) {
        maxId = quoteId;
      }
    }
    return String(maxId + 1);
  }
}

export const Quotes = QuoteModel.getInstance();
