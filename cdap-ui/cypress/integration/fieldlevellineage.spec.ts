/*
 * Copyright © 2019 Cask Data, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
*/

import * as Helpers from '../helpers';

let headers = {};
const fllPipeline = `fll_pipeline_${Date.now()}`;

describe('Generating and navigating field level lineage for datasets', () => {
  before(() => {
    Helpers.loginIfRequired().then(() => {
      cy.getCookie('CDAP_Auth_Token').then((cookie) => {
        if (!cookie) {
          return cy.start_wrangler(headers);
        }
        headers = {
          Authorization: 'Bearer ' + cookie.value,
        };
        return cy.start_wrangler(headers);
      });
    });
  });
  before(() => {
    // run a pipeline to generate lineage
    Helpers.deployAndTestPipeline('fll_airport_pipeline.json', fllPipeline, () => {
      cy.get('[data-cy="pipeline-run-btn"]').click();
      cy.wait(10000);
      cy.get('.run-info-container', { timeout: 150000 }).should('contain', 'Succeeded');
    });
  });
  after(() => {
    // Delete the pipeline to clean up
    cy.cleanup_pipelines(headers, fllPipeline);
  });
  it('Should show lineage for the default time frame (last 7 days)', () => {
    cy.visit('cdap/ns/default/datasets/Airport_sink/fields');
    // should see last 7 days of lineage selected by default
    cy.get('[data-cy="fll-time-picker"]').should(($div) => {
      expect($div).to.contain('Last 7 days');
    });
    // should see the correct fields for the selected dataset
    cy.get('[data-cy="target-fields"]').within(() => {
      cy.get('.field-row').should(($fields) => {
        expect($fields).to.have.length(8);
        // should see the correct field(s) for the impact dataset
        expect($fields).to.contain('longitude');
      });
    });
  });
  it('Should show operations for target field', () => {
    // focus on a field with outgoing operations
    cy.get('[data-cy="target-fields"] .field-row').within(() => {
      // this doesn't work and I don't know why
      cy.contains('Incoming operations').click();
    });
    cy.get('.operations-container').should('exist');
    // close the modal
    cy.get('.modal-title .close-section').click();
  });
  it('Should allow user to see field level lineage for a custom date range', () => {
    // click on date picker dropdown
    cy.get('.time-picker-dropdown')
      .find('.dropdown-toggle')
      .click();
    cy.get('.dropdown-menu')
      .find('[data-cy="CUSTOM"]')
      .click();
    cy.get('.time-range-selector').should('exist');
    cy.get('.time-range-selector').within(() => {
      cy.contains('Start Time').click();
    });
    cy.get('.react-calendar').within(() => {
      // start range two years and one month ago
      cy.get('.react-calendar__navigation__prev2-button').click();
      cy.get('.react-calendar__navigation__prev2-button').click();
      cy.get('.react-calendar__navigation__prev-button').click();
    });
    cy.get('.react-calendar__month-view__days').within(() => {
      cy.get('button')
        .first()
        .click();
    });

    cy.get('.time-range-selector').within(() => {
      cy.contains('End Time').click();
    });
    // end range two years ago
    cy.get('.react-calendar').within(() => {
      cy.get('.react-calendar__navigation__next-button').click();
    });
    cy.get('.react-calendar__month-view__days').within(() => {
      cy.get('button')
        .first()
        .click();
    });

    cy.get('.done-button')
      .contains('Done')
      .click();

    // Should see on field lineage for fields, which should be disabled
    cy.get('.field-row.disabled').should(($fields) => {
      expect($fields).to.have.length(7);
    });
  });
});
