/**
 *
 * Zigbee2MqttDevice - A Zigbee2Mqtt device.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

import { Action, Device, Event } from 'gateway-addon';
import { PropertyValue, Event as EventSchema } from 'gateway-addon/lib/schema';
import { Zigbee2MqttAdapter, DeviceDefinition, Expos } from './zigbee2mqtt-adapter';
import {
  Zigbee2MqttProperty,
  WRITE_BIT,
} from './zigbee2mqtt-property';
import mqtt from 'mqtt';
import DEBUG_FLAG from '../zb-debug';
import { OnOffProperty } from './properties/onOffProperty';
import { BrightnessProperty } from './properties/brightnessProperty';
import { ColorTemperatureProperty } from './properties/colorTemperatureProperty';
import { ColorProperty } from './properties/colorProperty';
import { ContactProperty } from './properties/contactProperty';
import { HeatingCoolingProperty } from './properties/heatingCoolingProperty';
import { parseType, parseUnit } from './utils';

function debug(): boolean {
  return DEBUG_FLAG.DEBUG_zigbee2mqtt;
}

const IGNORED_PROPERTIES = [
  'linkquality',
  'local_temperature_calibration',
  'update',
  'update_available',
  'color_temp_startup',
  'voltage',
  'led_indication',
  'occupancy_timeout',
  'illuminance',
  'motion_sensitivity',
  'requested_brightness_percent',
  'requested_brightness_level',
  'action_side',
  'eurotronic_trv_mode',
  'eurotronic_valve_position',
];

export class Zigbee2MqttDevice extends Device {
  private deviceTopic: string;

  constructor(
    adapter: Zigbee2MqttAdapter,
    id: string,
    deviceDefinition: DeviceDefinition,
    private client: mqtt.Client,
    topicPrefix: string
  ) {
    super(adapter, id);
    this.deviceTopic = `${topicPrefix}/${deviceDefinition.friendly_name}`;

    this.detectProperties(deviceDefinition);

    console.log(`Subscribing to ${this.deviceTopic}`);

    client.subscribe(this.deviceTopic, (err) => {
      if (err) {
        console.error(`Could not subscribe to ${this.deviceTopic}: ${err}`);
      }
    });

    if (deviceDefinition.friendly_name) {
      this.setTitle(deviceDefinition.friendly_name);
    } else {
      this.setTitle(`Zigbee2MQTT (${id})`);
    }
  }

  protected detectProperties(deviceDefinition: DeviceDefinition): void {
    for (const expose of deviceDefinition?.definition?.exposes ?? []) {
      switch (expose.type ?? '') {
        case 'light':
          this.createLightProperties(expose);
          break;
        case 'switch':
          this.createSmartPlugProperties(expose);
          break;
        case 'climate':
          this.createThermostatProperties(expose);
          break;
        default:
          if (expose.name === 'action') {
            this.createEvents(expose.values as string[]);
          } else {
            const isWriteOnly = (expose.access ?? 0) == WRITE_BIT;

            if (isWriteOnly) {
              this.createAction(expose);
            } else {
              this.createProperty(expose);
            }
          }
          break;
      }
    }
  }

  private createLightProperties(expose: Expos): void {
    if (expose.features) {
      ((this as unknown) as { '@type': string[] })['@type'].push('Light');

      for (const feature of expose.features) {
        if (feature.name) {
          switch (feature.name) {
            case 'state':
              {
                console.log(`Creating property for ${feature.name}`);

                const property = new OnOffProperty(
                  this,
                  feature.name,
                  feature,
                  this.client,
                  this.deviceTopic
                );

                this.addProperty(property);
              }
              break;
            case 'brightness':
              {
                console.log(`Creating property for ${feature.name}`);

                const property = new BrightnessProperty(
                  this,
                  feature.name,
                  feature,
                  this.client,
                  this.deviceTopic
                );

                this.addProperty(property);
              }
              break;
            case 'color_temp':
              {
                console.log(`Creating property for ${feature.name}`);

                const property = new ColorTemperatureProperty(
                  this,
                  feature.name,
                  feature,
                  this.client,
                  this.deviceTopic
                );

                this.addProperty(property);
              }
              break;
            case 'color_xy':
              {
                console.log(`Creating property for ${feature.name}`);

                const property = new ColorProperty(
                  this,
                  'color',
                  feature,
                  this.client,
                  this.deviceTopic
                );

                this.addProperty(property);
              }
              break;
          }
        } else {
          console.log(`Ignoring property without name: ${JSON.stringify(expose, null, 0)}`);
        }
      }
    } else {
      console.warn(`Expected features array in light expose: ${JSON.stringify(expose)}`);
    }
  }

  private createSmartPlugProperties(expose: Expos): void {
    if (expose.features) {
      ((this as unknown) as { '@type': string[] })['@type'].push('SmartPlug');

      for (const feature of expose.features) {
        if (feature.name) {
          switch (feature.name) {
            case 'state':
              {
                console.log(`Creating property for ${feature.name}`);

                const property = new OnOffProperty(
                  this,
                  feature.name,
                  feature,
                  this.client,
                  this.deviceTopic
                );

                this.addProperty(property);
              }
              break;
          }
        } else {
          console.log(`Ignoring property without name: ${JSON.stringify(expose, null, 0)}`);
        }
      }
    } else {
      console.warn(`Expected features array in light expose: ${JSON.stringify(expose)}`);
    }
  }

  private createThermostatProperties(expose: Expos): void {
    if (expose.features) {
      ((this as unknown) as { '@type': string[] })['@type'].push('Thermostat');

      for (const feature of expose.features) {
        if (feature.name) {
          switch (feature.name) {
            case 'system_mode': {
              console.log(`Creating property for ${feature.name}`);

              const property = new Zigbee2MqttProperty<string>(
                this,
                feature.name,
                feature,
                this.client,
                this.deviceTopic,
                {
                  '@type': 'ThermostatModeProperty',
                  type: 'string',
                }
              );

              this.addProperty(property);
              break;
            }
            case 'running_state':
              {
                console.log(`Creating property for ${feature.name}`);

                const property = new HeatingCoolingProperty(
                  this,
                  feature.name,
                  feature,
                  this.client,
                  this.deviceTopic
                );

                this.addProperty(property);
              }
              break;
            default:
              this.createProperty(feature);
              break;
          }
        } else {
          console.log(`Ignoring property without name: ${JSON.stringify(expose, null, 0)}`);
        }
      }
    } else {
      console.warn(`Expected features array in thermostat expose: ${JSON.stringify(expose)}`);
    }
  }

  private createEvents(values: string[]): void {
    if (Array.isArray(values)) {
      if (values.length > 0) {
        let isPushbutton = false;

        for (const value of values) {
          console.log(`Creating property for ${value}`);

          const additionalProperties: Record<string, unknown> = {};

          if (value.indexOf('single') > -1 || value === 'on' || value === 'toggle') {
            additionalProperties['@type'] = 'PressedEvent';
            isPushbutton = true;
          }

          if (value.indexOf('double') > -1) {
            additionalProperties['@type'] = 'DoublePressedEvent';
            isPushbutton = true;
          }

          if (value.indexOf('release') > -1) {
            additionalProperties['@type'] = 'LongPressedEvent';
            isPushbutton = true;
          }

          this.addEvent(value, {
            name: value,
            ...additionalProperties,
          });

          console.log({
            name: value,
            ...additionalProperties,
          });
        }

        if (isPushbutton) {
          const device = (this as unknown) as { '@type': string[] };
          device['@type'].push('PushButton');
        }
      } else {
        console.log(`Expected list of values but got ${JSON.stringify(values)}`);
      }
    } else {
      console.log(`Expected array but got ${typeof values}`);
    }
  }

  private createAction(expose: Expos): void {
    if (expose.name) {
      console.log(`Creating action for ${expose.name}`);

      this.addAction(expose.name, {
        description: expose.description,
        input: {
          type: parseType(expose),
          unit: parseUnit(expose.unit),
          enum: expose.values,
          minimum: expose.value_min,
          maximum: expose.value_max,
        },
      });
    } else {
      console.log(`Ignoring action without name: ${JSON.stringify(expose, null, 0)}`);
    }
  }

  private createProperty<T extends PropertyValue>(expose: Expos): void {
    if (expose.name) {
      if (IGNORED_PROPERTIES.includes(expose.name)) {
        return;
      }

      console.log(`Creating property for ${expose.name}`);

      switch (expose.name) {
        case 'contact': {
          const property = new ContactProperty(
            this,
            expose.name,
            expose,
            this.client,
            this.deviceTopic);
          this.addProperty(property);
        }
          break;
        default: {
          const property = new Zigbee2MqttProperty<T>(
            this,
            expose.name,
            expose,
            this.client,
            this.deviceTopic
          );
          this.addProperty(property);
        }
          break;
      }
    } else {
      console.log(`Ignoring property without name: ${JSON.stringify(expose, null, 0)}`);
    }
  }

  update(update: Record<string, PropertyValue>): void {
    if (typeof update !== 'object') {
      console.log(`Expected object but got ${typeof update}`);
    }

    for (const [key, value] of Object.entries(update)) {
      if (IGNORED_PROPERTIES.includes(key)) {
        continue;
      }

      if (key === 'action') {
        if (typeof value !== 'string') {
          console.log(`Expected event of type string but got ${typeof value}`);
          continue;
        }

        const exists = ((this as unknown) as { events: Map<string, EventSchema> }).events.has(
          value
        );

        if (!exists) {
          if (debug()) {
            console.log(`Event '${value}' does not exist on ${this.getTitle()} (${this.getId()})`);
          }
          continue;
        }

        const event = new Event(this, value as string);
        this.eventNotify(event);
      } else {
        const property = this.findProperty(key) as Zigbee2MqttProperty<PropertyValue>;

        if (property) {
          property.update(value, update);
        } else if (debug()) {
          console.log(`Property '${key}' does not exist on ${this.getTitle()} (${this.getId()})`);
        }
      }
    }
  }

  performAction(action: Action): Promise<void> {
    const { name, input } = action.asDict();

    action.start();

    return new Promise<void>((resolve, reject) => {
      const writeTopic = `${this.deviceTopic}/set`;
      const json = { [name]: input };

      if (debug()) {
        console.log(`Sending ${JSON.stringify(json)} to ${writeTopic}`);
      }

      this.client.publish(writeTopic, JSON.stringify(json), (error) => {
        action.finish();

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  fetchValues(): void {
    const { properties } = (this as unknown) as {
      properties: Map<string, Zigbee2MqttProperty<PropertyValue>>;
    };

    const payload: Record<string, string> = {};

    for (const property of properties.values()) {
      if (property.isReadable()) {
        payload[property.getName()] = '';
      }
    }

    if (Object.keys(payload).length > 0) {
      const readTopic = `${this.deviceTopic}/get`;
      const readPayload = JSON.stringify(payload);

      if (debug()) {
        console.log(`Sending ${readPayload} to ${readTopic}`);
      }

      this.client.publish(readTopic, readPayload, (error) => {
        if (error) {
          console.warn(`Could not send ${readPayload} to ${readTopic}: ${console.error()}`);
        }
      });
    } else if (debug()) {
      console.log(`${this.getTitle()} has no readable properties`);
    }
  }
}
