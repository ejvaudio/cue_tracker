<?php

require(__DIR__ . '/vendor/autoload.php');

Httpful\Bootstrap::init();
RESTful\Bootstrap::init();
Balanced\Bootstrap::init();

Balanced\Settings::$api_key = "ak-test-1p1Tsac7gHeMQowL2seB7ieliuAJAufyq";

$customer = \Balanced\Customer::get("/v1/customers/CU7wGDVh8FjYMPfkPl9SzWAu");
$customer->debit('5000');

?>