import { EmailBuilder } from '../../interfaces/EmailBuilder';
import { EmailOptions } from '../../interfaces/EmailOptions';
import { checkIfHTML } from '../../utils';
import { isNil } from 'lodash';

export class MailgunMailBuilder implements EmailBuilder {
  private _from?: string;
  private _to?: string | string[];
  private _subject?: string;
  private _cc?: string | string[];
  private _bcc?: string | string[];
  private _attachments?: string[];
  private _replyTo?: string;
  private _html?: string;
  private _text?: string;

  setSender(sender: string): EmailBuilder {
    this._from = sender;
    return this;
  }

  getSender(): string | undefined {
    return this._from;
  }

  setReceiver(receiver: string | string[], clearReceiver?: boolean): EmailBuilder {
    if (typeof receiver === 'string') {
      if (this._to && this._to.length > 0) {
        if (typeof this._to !== 'string') {
          if (clearReceiver) {
            this._to = [];
          }
          this._to.push(receiver);
        } else {
          this._to = receiver;
        }
      } else {
        this._to = receiver;
      }
    } else {
      if (this._to && this._to.length > 0) {
        if (typeof this._to !== 'string') {
          if (clearReceiver) {
            this._to = [];
          }
          this._to.concat(receiver);
        } else {
          this._to = receiver.concat([this._to]);
        }
      } else {
        this._to = receiver;
      }
    }
    return this;
  }

  getReceiver(): string | string[] | undefined {
    return this._to;
  }

  setCC(cc: string | string[], clearCC?: boolean): EmailBuilder {
    if (typeof cc === 'string') {
      if (this._cc && this._cc.length > 0) {
        if (typeof this._cc !== 'string') {
          if (clearCC) {
            this._cc = [];
          }
          this._cc.push(cc);
        } else {
          this._cc = cc;
        }
      } else {
        this._cc = cc;
      }
    } else {
      if (this._cc && this._cc.length > 0) {
        if (typeof this._cc !== 'string') {
          if (clearCC) {
            this._cc = [];
          }
          this._cc.concat(cc);
        } else {
          this._cc = cc.concat([this._cc]);
        }
      } else {
        this._cc = cc;
      }
    }

    return this;
  }

  setSubject(subject: string): EmailBuilder {
    this._subject = subject;
    return this;
  }

  getSubject(): string | undefined {
    return this._subject;
  }

  getCC(): string | string[] | undefined {
    return this._cc;
  }

  setBCC(bcc: string | string[], clearBCC?: boolean): EmailBuilder {
    if (typeof bcc === 'string') {
      if (this._bcc && this._bcc.length > 0) {
        if (typeof this._bcc !== 'string') {
          if (clearBCC) {
            this._bcc = [];
          }
          this._bcc.push(bcc);
        } else {
          this._bcc = bcc;
        }
      } else {
        this._bcc = bcc;
      }
    } else {
      if (this._bcc && this._bcc.length > 0) {
        if (typeof this._bcc !== 'string') {
          if (clearBCC) {
            this._bcc = [];
          }
          this._bcc.concat(bcc);
        } else {
          this._bcc = bcc.concat([this._bcc]);
        }
      } else {
        this._bcc = bcc;
      }
    }
    return this;
  }

  getBCC(): string | string[] | undefined {
    return this._bcc;
  }

  setReplyTo(replyTo: string): EmailBuilder {
    this._replyTo = replyTo;
    return this;
  }

  getReplyTo() {
    return this._replyTo;
  }

  checkIfHTML(text: string): boolean {
    if (!text || text.length === 0) return false;
    var isHTML = RegExp.prototype.test.bind(/^(<([^>]+)>)$/i);
    return isHTML(text);
  }

  setContent(content: string): EmailBuilder {
    if (checkIfHTML(content)) {
      if (this._text) {
        this._text = '';
      }
      this._html = content;
    } else {
      if (this._html) {
        this._html = '';
      }
      this._text = content;
    }
    return this;
  }

  getContent(): string | undefined {
    return this._html ? this._html : this._text;
  }

  nullOrEmptyCheck(prop: any) {
    return isNil(prop) || prop.length === 0;
  }

  getMailObject(): EmailOptions {
    let finalObject: any = {};

    if (!this.nullOrEmptyCheck(this._from)) {
      finalObject['from'] = this._from;
    } else {
      throw new Error('Sender needs to be specified');
    }

    if (!this.nullOrEmptyCheck(this._to)) {
      finalObject['to'] = this._to;
    } else {
      throw new Error('Recipient needs to be specified');
    }

    if (!this.nullOrEmptyCheck(this._subject)) {
      finalObject['subject'] = this._subject;
    } else {
      throw new Error('Subject needs to be specified');
    }

    if (this.nullOrEmptyCheck(this._html) && this.nullOrEmptyCheck(this._text)) {
      throw new Error('Content needs to be specified');
    } else {
      if (!this.nullOrEmptyCheck(this._html)) {
        finalObject['html'] = this._html;
      } else {
        finalObject['text'] = this._text;
      }
    }

    if (!this.nullOrEmptyCheck(this._cc)) {
      finalObject['cc'] = this._cc;
    }

    if (!this.nullOrEmptyCheck(this._bcc)) {
      finalObject['bcc'] = this._bcc;
    }

    if (!this.nullOrEmptyCheck(this._replyTo)) {
      finalObject['replyTo'] = this._replyTo;
    }

    if (!this.nullOrEmptyCheck(this._attachments)) {
      finalObject['attachments'] = this._attachments?.map((r) => {
        return {
          path: r,
        };
      });
    }

    return finalObject;
  }

  addAttachments(attachments: string[]): EmailBuilder {
    this._attachments = attachments;
    return this;
  }

  getAttachments(): string[] | undefined {
    return this._attachments;
  }
}